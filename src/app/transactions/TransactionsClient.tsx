'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Receipt, Search, Plus, X, ChevronLeft, ChevronRight,
  Loader2, Trash2, AlertCircle, Pencil
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { Account, Transaction, TransactionLine, PaginatedResponse } from '@/types'

type AccountOption = Pick<Account, 'id' | 'code' | 'name' | 'type'>
type TransactionWithLines = Transaction & {
  lines?: (TransactionLine & {
    account?: AccountOption
  })[]
}

interface Props {
  businessId: string
  accounts: AccountOption[]
}

// Helpers
function formatIDR(n: number) {
  if (Math.abs(n) >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(1)}jt`
  if (Math.abs(n) >= 1_000) return `Rp${(n / 1_000).toFixed(0)}rb`
  return `Rp${n}`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Main component
export default function TransactionsClient({ businessId, accounts }: Props) {
  const [transactions, setTransactions] = useState<TransactionWithLines[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingTx, setEditingTx] = useState<TransactionWithLines | null>(null)

  const perPage = 20
  const totalPages = Math.ceil(total / perPage)

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        business_id: businessId,
        page: String(page),
        limit: String(perPage),
        ...(search && { search }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      })
      const res = await fetch(`/api/transactions?${params}`)
      const json: PaginatedResponse<TransactionWithLines> & { error?: string } = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat transaksi')
      setTransactions(json.data || [])
      setTotal(json.total || 0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat transaksi'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [businessId, page, search, dateFrom, dateTo])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo])

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin hapus transaksi ini?')) return
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Transaksi dihapus')
      fetchTransactions()
    } else {
      const body = await res.json().catch(() => null)
      toast.error(body?.error || 'Gagal menghapus')
    }
  }

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">Jurnal Umum</p>
          <h1 className="page-title flex items-center gap-2">
            <Receipt size={24} className="text-brand-400" />
            Transaksi
          </h1>
          <p className="page-subtitle">{total} transaksi total</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            <Plus size={15} />
            Input Manual
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="panel-soft flex flex-wrap gap-3 p-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari transaksi..."
            className="input pl-9"
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="input w-auto [color-scheme:dark]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="input w-auto [color-scheme:dark]"
        />
        {(search || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
            className="btn-secondary"
          >
            <X size={13} /> Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table-shell">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-brand-400" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchTransactions} />
        ) : transactions.length === 0 ? (
          <EmptyState hasFilters={Boolean(search || dateFrom || dateTo)} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-head">
                    {['Tanggal', 'Deskripsi', 'Akun', 'Debit', 'Kredit', 'Sumber', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-surface-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => (
                    <TxRow key={tx.id} tx={tx} onEdit={setEditingTx} onDelete={handleDelete} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-surface-700">
              {transactions.map(tx => (
                <TxCard key={tx.id} tx={tx} onEdit={setEditingTx} onDelete={handleDelete} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-surface-400">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Halaman transaksi sebelumnya"
              className="p-2 rounded-lg border border-surface-700 text-surface-400
                hover:text-white hover:border-surface-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Halaman transaksi berikutnya"
              className="p-2 rounded-lg border border-surface-700 text-surface-400
                hover:text-white hover:border-surface-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showForm && (
        <ManualEntryModal
          businessId={businessId}
          accounts={accounts}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchTransactions() }}
        />
      )}

      {editingTx && (
        <ManualEntryModal
          businessId={businessId}
          accounts={accounts}
          transaction={editingTx}
          onClose={() => setEditingTx(null)}
          onSaved={() => { setEditingTx(null); fetchTransactions() }}
        />
      )}
    </div>
  )
}

// Sub-components

function TxRow({
  tx, onEdit, onDelete
}: {
  tx: TransactionWithLines
  onEdit: (tx: TransactionWithLines) => void
  onDelete: (id: string) => void
}) {
  const lines = tx.lines || []
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0)
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0)
  const mainAccounts = lines.slice(0, 2).map(l => l.account?.name).filter(Boolean).join(', ')

  return (
    <tr className="table-row group">
      <td className="px-4 py-3 text-sm text-surface-300 whitespace-nowrap">{formatDate(tx.date)}</td>
      <td className="px-4 py-3">
        <p className="text-sm text-white">{tx.description}</p>
        {tx.reference && <p className="text-xs text-surface-500">Ref: {tx.reference}</p>}
      </td>
      <td className="px-4 py-3 text-xs text-surface-400 max-w-32 truncate">{mainAccounts}</td>
      <td className="px-4 py-3 text-sm font-mono text-surface-200">{totalDebit > 0 ? formatIDR(totalDebit) : '-'}</td>
      <td className="px-4 py-3 text-sm font-mono text-surface-200">{totalCredit > 0 ? formatIDR(totalCredit) : '-'}</td>
      <td className="px-4 py-3">
        <span className={`chip border-0
          ${tx.source === 'ai'
            ? 'bg-brand-500/15 text-brand-400'
            : 'bg-surface-700 text-surface-400'
          }`}>
          {tx.source === 'ai' ? 'AI' : 'Manual'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(tx)}
            className="p-1.5 rounded-lg text-surface-500 hover:text-brand-400 hover:bg-brand-500/10 transition-all"
            aria-label="Edit transaksi"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(tx.id)}
            className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
            aria-label="Hapus transaksi"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function TxCard({
  tx, onEdit, onDelete
}: {
  tx: TransactionWithLines
  onEdit: (tx: TransactionWithLines) => void
  onDelete: (id: string) => void
}) {
  const lines = tx.lines || []
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0)

  return (
    <div className="p-4 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{tx.description}</p>
        <p className="text-xs text-surface-500 mt-1">
          {formatDate(tx.date)} - {tx.source === 'ai' ? 'AI' : 'Manual'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-surface-200">{formatIDR(totalDebit)}</p>
        <button onClick={() => onEdit(tx)} className="text-surface-600 hover:text-brand-400 p-1" aria-label="Edit transaksi">
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(tx.id)} className="text-surface-600 hover:text-red-400 p-1" aria-label="Hapus transaksi">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="empty-state">
      <Receipt size={36} className="mb-3 opacity-30" />
      <p className="text-sm">
        {hasFilters ? 'Tidak ada transaksi yang cocok dengan filter' : 'Belum ada transaksi'}
      </p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="empty-state text-surface-400">
      <AlertCircle size={36} className="mb-3 text-red-400" />
      <p className="text-sm">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 btn-secondary"
      >
        Coba Lagi
      </button>
    </div>
  )
}

// Manual entry modal

interface EntryLine {
  account_id: string
  debit: string
  credit: string
  note: string
}

function ManualEntryModal({
  businessId, accounts, transaction, onClose, onSaved
}: {
  businessId: string
  accounts: AccountOption[]
  transaction?: TransactionWithLines
  onClose: () => void
  onSaved: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(transaction?.date || today)
  const [description, setDescription] = useState(transaction?.description || '')
  const [reference, setReference] = useState(transaction?.reference || '')
  const [lines, setLines] = useState<EntryLine[]>(() => {
    if (transaction?.lines?.length) {
      return transaction.lines.map((line) => ({
        account_id: line.account_id,
        debit: Number(line.debit) > 0 ? String(Number(line.debit)) : '',
        credit: Number(line.credit) > 0 ? String(Number(line.credit)) : '',
        note: line.note || '',
      }))
    }

    return [
      { account_id: '', debit: '', credit: '', note: '' },
      { account_id: '', debit: '', credit: '', note: '' },
    ]
  })
  const [loading, setLoading] = useState(false)
  const isEditing = Boolean(transaction)

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  const updateLine = (i: number, field: keyof EntryLine, value: string) => {
    setLines(prev => prev.map((line, idx) => {
      if (idx !== i) return line
      if (field === 'debit' && Number(value) > 0) return { ...line, debit: value, credit: '' }
      if (field === 'credit' && Number(value) > 0) return { ...line, credit: value, debit: '' }
      return { ...line, [field]: value }
    }))
  }

  const addLine = () => {
    setLines(prev => [...prev, { account_id: '', debit: '', credit: '', note: '' }])
  }

  const removeLine = (i: number) => {
    if (lines.length <= 2) return
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleSubmit = async () => {
    if (!description.trim()) { toast.error('Isi deskripsi transaksi'); return }
    if (!isBalanced) { toast.error('Total debit harus sama dengan total kredit'); return }
    if (accounts.length === 0) { toast.error('Belum ada akun aktif untuk transaksi'); return }

    const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
    if (validLines.length < 2) { toast.error('Minimal 2 baris transaksi'); return }
    if (validLines.some(l => (parseFloat(l.debit) || 0) > 0 && (parseFloat(l.credit) || 0) > 0)) {
      toast.error('Satu baris hanya boleh debit atau kredit')
      return
    }

    setLoading(true)
    const res = await fetch(isEditing ? `/api/transactions/${transaction!.id}` : '/api/transactions', {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        date,
        description,
        reference: reference || undefined,
        entries: validLines.map(l => ({
          account_id: l.account_id,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          note: l.note || undefined,
        }))
      })
    })

    setLoading(false)
    if (res.ok) {
      toast.success(isEditing ? 'Transaksi diperbarui' : 'Transaksi berhasil disimpan')
      onSaved()
    } else {
      const err = await res.json()
      toast.error(err.error || 'Gagal menyimpan')
    }
  }

  // Group accounts by type
  const groupedAccounts = accounts.reduce((acc, a) => {
    if (!acc[a.type]) acc[a.type] = []
    acc[a.type].push(a)
    return acc
  }, {} as Record<string, AccountOption[]>)

  const typeLabels: Record<string, string> = {
    ASSET: 'Aset', LIABILITY: 'Kewajiban',
    EQUITY: 'Ekuitas', REVENUE: 'Pendapatan', EXPENSE: 'Beban'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="modal-backdrop" onClick={onClose} />

      {/* Modal */}
      <div className="modal-panel max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-surface-900/95 backdrop-blur">
          <h2 className="font-semibold text-white">{isEditing ? 'Edit Transaksi' : 'Input Transaksi Manual'}</h2>
          <button onClick={onClose} className="text-surface-500 hover:text-white p-1" aria-label="Tutup modal">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="input [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">No. Referensi (opsional)</label>
              <input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="INV-001"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-300 mb-1.5">Deskripsi *</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Penjualan barang ke Bu Siti"
              className="input"
            />
          </div>

          {/* Journal Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-surface-300">Baris Jurnal (Double-entry)</label>
              <span className={`chip ${isBalanced ? 'bg-brand-500/10 text-brand-300' : 'bg-amber-500/10 text-amber-300'}`}>
                {isBalanced ? 'Balance' : `Selisih: Rp${Math.abs(totalDebit - totalCredit).toLocaleString()}`}
              </span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 mb-2 px-1">
              <p className="col-span-4 text-xs text-surface-500">Akun</p>
              <p className="col-span-3 text-xs text-surface-500">Debit (Rp)</p>
              <p className="col-span-3 text-xs text-surface-500">Kredit (Rp)</p>
              <p className="col-span-2" />
            </div>

            <div className="space-y-2">
              {accounts.length === 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  Belum ada akun aktif. Tambahkan akun di Pengaturan sebelum membuat transaksi.
                </div>
              )}
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={line.account_id}
                    onChange={e => updateLine(i, 'account_id', e.target.value)}
                    className="col-span-4 input rounded-lg px-2 py-2 text-xs"
                  >
                    <option value="">Pilih akun...</option>
                    {Object.entries(groupedAccounts).map(([type, accs]) => (
                      <optgroup key={type} label={typeLabels[type] || type}>
                        {accs.map(a => (
                          <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={line.debit}
                    onChange={e => updateLine(i, 'debit', e.target.value)}
                    placeholder="0"
                    min="0"
                    className="col-span-3 input rounded-lg px-2 py-2 text-xs font-mono"
                  />
                  <input
                    type="number"
                    value={line.credit}
                    onChange={e => updateLine(i, 'credit', e.target.value)}
                    placeholder="0"
                    min="0"
                    className="col-span-3 input rounded-lg px-2 py-2 text-xs font-mono"
                  />
                  <button
                    onClick={() => removeLine(i)}
                    disabled={lines.length <= 2}
                    aria-label="Hapus baris jurnal"
                    className="col-span-2 p-2 text-surface-600 hover:text-red-400
                      disabled:opacity-30 disabled:cursor-not-allowed rounded-lg
                      hover:bg-red-500/10 transition-colors flex items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addLine}
              className="mt-2 flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              <Plus size={12} /> Tambah baris
            </button>
          </div>

          {/* Totals */}
          <div className="flex justify-end gap-8 pt-2 border-t border-white/10">
            <div className="text-right">
              <p className="text-xs text-surface-500">Total Debit</p>
              <p className="text-sm font-semibold font-mono text-white">Rp{totalDebit.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-surface-500">Total Kredit</p>
              <p className="text-sm font-semibold font-mono text-white">Rp{totalCredit.toLocaleString()}</p>
            </div>
          </div>

          {!isBalanced && totalDebit > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                Total debit dan kredit harus sama. Ini adalah prinsip double-entry accounting.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isBalanced || loading}
            className="btn-primary w-full py-3"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
            {loading ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Simpan Transaksi'}
          </button>
        </div>
      </div>
    </div>
  )
}

