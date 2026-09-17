'use client'
import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { simulateCash } from '@/lib/accounting/scenario'
export default function CashSimulator({ cashNow }: { cashNow: number }) {
  const [receipts,setReceipts] = useState('0')
  const [payments,setPayments] = useState('0')
  const [collection,setCollection] = useState('0')
  const [deferred,setDeferred] = useState('0')
  let result: ReturnType<typeof simulateCash> | null = null
  let error = ''
  try { result = simulateCash({ cashNow, expectedReceipts:Number(receipts), plannedPayments:Number(payments), collection:Number(collection), deferredPurchases:Number(deferred) }) } catch(e) { error = (e as Error).message }
  const money = (n:number) => `Rp${n.toLocaleString('id-ID')}`
  return <section className="premium-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-5"><h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal size={17} className="text-brand-400" />Bagaimana jika?</h2><span className="chip">Simulasi kas 30 hari</span></div><div className="space-y-5 p-5"><p className="text-sm leading-6 text-surface-300">Uji dampak rencana Anda sebelum bertindak. Mulai dari saldo tercatat <span className="font-semibold text-white">{money(cashNow)}</span>.</p><div className="grid gap-4 sm:grid-cols-2">{[
    {label:'Penerimaan kas yang direncanakan',value:receipts,set:setReceipts},
    {label:'Pembayaran kas yang direncanakan',value:payments,set:setPayments},
    {label:'Tambahan piutang yang berhasil ditagih',value:collection,set:setCollection},
    {label:'Pembelian yang ditunda dari rencana',value:deferred,set:setDeferred},
  ].map(field=><label key={field.label} className="text-xs leading-5 text-surface-300">{field.label} (Rp)<input type="number" min="0" step="1000" className="input mt-2" value={field.value} onChange={e=>field.set(e.target.value)} /></label>)}</div>
  {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}{result && <div aria-live="polite" className="grid grid-cols-1 gap-4 rounded-lg border border-brand-400/20 bg-brand-500/5 p-4 sm:grid-cols-3">{[['Tanpa tindakan',result.baseline],['Dengan skenario',result.scenario],['Dampak tindakan',result.improvement]].map(([label,value])=><div key={label}><p className="text-[11px] text-surface-400">{label}</p><p className="mt-2 text-lg font-semibold tabular-nums text-brand-300">{money(Number(value))}</p></div>)}</div>}
  <p className="text-xs leading-6 text-surface-400">Skenario berdasarkan asumsi Anda, bukan prediksi AI. Jangan hitung penagihan yang sama dalam penerimaan dasar dan tambahan penagihan. Penundaan pembelian memperbaiki kas sementara, tetapi dapat mengganggu stok dan penjualan. Belum memperhitungkan pajak, musim, atau risiko gagal bayar.</p></div></section>
}
