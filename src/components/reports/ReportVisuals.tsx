'use client'
import type { AccountBalance } from '@/types'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
const money = (n: number) =>
  `Rp${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`
export function AccountTable({
  title,
  accounts,
  total,
  negative = false,
}: {
  title: string
  accounts: Pick<AccountBalance, 'id' | 'code' | 'name' | 'balance'>[]
  total: number
  negative?: boolean
}) {
  return (
    <div>
      <div className="flex justify-between gap-4 bg-white/[0.02] px-5 py-4 text-sm font-semibold">
        <h3 className={negative ? 'text-red-300' : 'text-brand-300'}>
          {title}
        </h3>
        <span className={negative ? 'text-red-300' : 'text-brand-300'}>
          {money(total)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 text-xs text-surface-400">
            <tr>
              <th className="px-5 py-3 text-left font-normal">Akun</th>
              <th className="py-3 text-left font-normal">Deskripsi</th>
              <th className="px-5 py-3 text-right font-normal">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-white/5">
                <td className="whitespace-nowrap px-5 py-4 text-xs text-surface-400">
                  {a.code}
                </td>
                <td className="min-w-32 py-4 text-surface-200">{a.name}</td>
                <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums">
                  {money(a.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {accounts.length === 0 && (
          <p className="p-5 text-xs text-surface-400">
            Belum ada saldo tercatat.
          </p>
        )}
      </div>
    </div>
  )
}
export function FinancialChart({
  values,
}: {
  values: { name: string; value: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={values} barSize={46}>
        <XAxis
          dataKey="name"
          tick={{ fill: '#a0b0bc', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          width={55}
          tick={{ fill: '#a0b0bc', fontSize: 10 }}
          tickFormatter={(n) =>
            Math.abs(n) >= 1e6
              ? `${n / 1e6}jt`
              : Math.abs(n) >= 1000
                ? `${n / 1000}rb`
                : String(n)
          }
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number) => money(v)}
          cursor={{ fill: '#ffffff05' }}
          contentStyle={{
            background: '#081924',
            border: '1px solid #30424e',
            borderRadius: 8,
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {values.map((v, i) => (
            <Cell key={v.name} fill={i === 0 ? '#51c99c' : '#ef786b'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
