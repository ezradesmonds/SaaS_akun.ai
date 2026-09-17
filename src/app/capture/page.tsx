import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/permissions/guard'
import OCRReceiptUploader from '@/components/transactions/OCRReceiptUploader'
export default async function CapturePage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/auth/login')
  return <div className="page-shell"><div><p className="eyebrow">Capture / Understand / Record</p><h1 className="page-title">Scan dokumen</h1><p className="page-subtitle">Unggah bukti. Periksa draft. Catat dengan yakin.</p></div>{ctx.can('create_transaction') && ctx.can('use_ai_chat') ? <OCRReceiptUploader businessId={ctx.businessId} /> : <p className="premium-card p-6">Peran Anda tidak memiliki akses untuk memindai dan mencatat transaksi.</p>}</div>
}
