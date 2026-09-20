import { z } from 'zod'
export const BusinessDateSchema = z.string().date()
export function businessToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
export function businessPeriods(now = new Date()) {
  const today = businessToday(now)
  const [year, month, day] = today.split('-').map(Number)
  const last = new Date(Date.UTC(year, month - 1, 0))
  const lastEnd = last.toISOString().slice(0, 10)
  const lastStart = lastEnd.slice(0, 7) + '-01'
  const comparableEnd = `${lastEnd.slice(0, 7)}-${String(Math.min(day, last.getUTCDate())).padStart(2, '0')}`
  return {
    today,
    start: today.slice(0, 7) + '-01',
    lastStart,
    lastEnd,
    comparableEnd,
  }
}
