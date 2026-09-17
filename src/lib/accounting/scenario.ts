export type CashScenario = { cashNow: number; expectedReceipts: number; plannedPayments: number; collection: number; deferredPurchases: number }
export function simulateCash(input: CashScenario) {
  if (Object.values(input).some(v => !Number.isFinite(v))) throw new Error('Isi seluruh asumsi dengan angka valid.')
  if ([input.expectedReceipts,input.plannedPayments,input.collection,input.deferredPurchases].some(v => v < 0)) throw new Error('Asumsi penerimaan dan pembayaran tidak boleh negatif.')
  if (input.deferredPurchases > input.plannedPayments) throw new Error('Penundaan pembelian tidak boleh melebihi rencana pembayaran.')
  const baseline = input.cashNow + input.expectedReceipts - input.plannedPayments
  return { baseline, scenario: baseline + input.collection + input.deferredPurchases, improvement: input.collection + input.deferredPurchases }
}
