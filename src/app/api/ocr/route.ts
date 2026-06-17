import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, trackUsage, AUTH_ERRORS } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'

// ── OCR Receipt via LLM Vision ────────────────────────────────
// Cara kerja:
// 1. User upload foto struk
// 2. Server encode ke base64
// 3. Kirim ke MiniMax vision (atau GPT-4o) 
// 4. LLM parse → return structured JSON transaksi
// 5. Frontend tampilkan preview → user konfirmasi → simpan

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const image = formData.get('image') as File | null
  const businessId = formData.get('business_id') as string | null

  if (!image || !businessId) {
    return NextResponse.json({ error: 'image dan business_id wajib diisi' }, { status: 400 })
  }

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.withinLimit('ai')) {
    return NextResponse.json({ ...AUTH_ERRORS.plan_limit_ai, plan: ctx.plan }, { status: 402 })
  }

  // Validate file
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  if (!validTypes.includes(image.type)) {
    return NextResponse.json({ error: 'Format gambar tidak didukung. Gunakan JPG, PNG, atau WEBP.' }, { status: 400 })
  }

  const maxSize = 5 * 1024 * 1024 // 5MB
  if (image.size > maxSize) {
    return NextResponse.json({ error: 'Ukuran gambar maksimal 5MB' }, { status: 400 })
  }

  try {
    // Convert image to base64
    const arrayBuffer = await image.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = image.type === 'image/heic' || image.type === 'image/heif' ? 'image/jpeg' : image.type

    // Get business accounts for context
    const supabase = createClient()
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, code, name, type')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('code')

    const accountList = (accounts || [])
      .map(a => `${a.id}|${a.code}|${a.name}|${a.type}`)
      .join('\n')

    // Call LLM with vision
    const ocrResult = await callVisionLLM(base64, mimeType, accountList)

    // Track AI and OCR usage separately for plan/audit reporting.
    trackUsage(businessId, 'ai_calls')
    trackUsage(businessId, 'ocr_scans')

    return NextResponse.json({
      success: true,
      extracted: ocrResult,
      confidence: ocrResult.confidence,
      raw_text: ocrResult.raw_text,
    })
  } catch (error) {
    console.error('OCR error:', error)
    return NextResponse.json({ error: 'Gagal membaca struk. Coba foto dengan pencahayaan yang lebih baik.' }, { status: 500 })
  }
}

// ── Vision LLM Call ───────────────────────────────────────────
interface OCRResult {
  date: string
  description: string
  merchant?: string
  items: { name: string; amount: number }[]
  total: number
  entries: {
    account_id: string
    account_name: string
    debit: number
    credit: number
    note: string
  }[]
  confidence: 'high' | 'medium' | 'low'
  raw_text: string
  notes: string
}

async function callVisionLLM(
  base64Image: string,
  mimeType: string,
  accountList: string,
): Promise<OCRResult> {
  const today = new Date().toISOString().split('T')[0]

  const systemPrompt = `
Kamu adalah AI yang mengekstrak data transaksi dari foto struk/nota/kwitansi untuk sistem akuntansi UMKM Indonesia.

Chart of accounts tersedia (format: id|kode|nama|tipe):
${accountList}

Output HANYA JSON valid, tidak ada teks lain. Format:
{
  "date": "YYYY-MM-DD",
  "description": "deskripsi singkat transaksi",
  "merchant": "nama toko/merchant jika ada",
  "items": [{"name": "nama item", "amount": 50000}],
  "total": 170000,
  "entries": [
    {"account_id": "uuid-dari-list", "account_name": "nama akun", "debit": 170000, "credit": 0, "note": ""},
    {"account_id": "uuid-dari-list", "account_name": "nama akun", "debit": 0, "credit": 170000, "note": ""}
  ],
  "confidence": "high|medium|low",
  "raw_text": "teks yang kamu baca dari gambar",
  "notes": "catatan tambahan jika ada ambiguitas"
}

Rules:
- Total debit HARUS = total credit (double-entry)
- Untuk pembelian: Debit akun beban/aset, Credit kas/bank
- Untuk penjualan: Debit kas/bank, Credit pendapatan
- Gunakan account_id dari list yang diberikan, pilih yang paling relevan
- Jika tanggal tidak terbaca, gunakan hari ini: ${today}
- confidence: high jika struk jelas terbaca, medium jika ada bagian kurang jelas, low jika banyak tidak terbaca
`.trim()

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Akun.AI OCR',
    },
    body: JSON.stringify({
      // Use a vision-capable model
      // MiniMax M1 supports vision, fallback to gpt-4o-mini
      model: 'openai/gpt-4o-mini', // cheapest vision model
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: 'Ekstrak data transaksi dari foto struk ini. Return JSON only.',
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Vision API error: ${response.status} - ${err}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) throw new Error('Empty response from vision LLM')

  try {
    const parsed = JSON.parse(content) as OCRResult
    return parsed
  } catch {
    throw new Error('Failed to parse LLM JSON response')
  }
}
