export type CashAccount = { code: string; name: string; type: string }
export type CashLine = { debit: number | string; credit: number | string; account: CashAccount | null; transaction: { id: string; date: string } }

// Default COA plus explicitly named cash accounts; never include receivables.
export function isCashAccount(account: CashAccount) {
  return account.type === 'ASSET' && (
    ['1-001', '1-002'].includes(account.code) || /^(kas|bank)(\s|$)/i.test(account.name)
  )
}

export function summarizeCash(lines: CashLine[], start: string, end: string) {
  let opening = 0
  const movements = new Map<string, number>()
  for (const line of lines) {
    if (!line.account || !isCashAccount(line.account) || line.transaction.date > end) continue
    const amount = Number(line.debit) - Number(line.credit)
    if (line.transaction.date < start) opening += amount
    else movements.set(line.transaction.id, (movements.get(line.transaction.id) || 0) + amount)
  }
  // Net cash legs per journal so bank-to-cash transfers are not inflated flows.
  let cashIn = 0, cashOut = 0
  for (const amount of Array.from(movements.values())) {
    if (amount > 0) cashIn += amount
    else cashOut -= amount
  }
  return { opening_balance: opening, cash_in: cashIn, cash_out: cashOut,
    net_cash: cashIn - cashOut, cash_balance: opening + cashIn - cashOut }
}

export function unclosedEarnings(accounts: { type: string; balance: number }[]) {
  return accounts.reduce((sum, a) => sum + (a.type === 'REVENUE' ? a.balance : a.type === 'EXPENSE' ? -a.balance : 0), 0)
}
