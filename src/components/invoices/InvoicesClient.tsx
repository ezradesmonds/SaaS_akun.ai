'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  Search,
  Send,
  UserPlus,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

type AccountOption = {
  id: string
  code: string
  name: string
  type: string
}

type Customer = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  npwp?: string | null
}

type InvoiceItem = {
  id?: string
  description: string
  quantity: number
  unit_price: number
  discount_amount: number
  line_total?: number
}

type Invoice = {
  id: string
  invoice_number: string
  issue_date: string
  due_date?: string | null
  status: 'draft' | 'issued' | 'paid' | 'void'
  subtotal_amount: number
  discount_amount: number
  ppn_rate: number
  ppn_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  notes?: string | null
  customer?: Customer | null
  items?: InvoiceItem[]
}

type Paginated<T> = {
  data: T[]
  total: number
  page: number
  per_page: number
  error?: string
}

type Props = {
  businessId: string
  businessName: string
  accounts: AccountOption[]
}

type InvoiceLine = {
  description: string
  quantity: string
  unit_price: string
}

function formatIDR(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function nextInvoiceNumber() {
  const date = new Date()
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `INV-${stamp}-${String(date.getTime()).slice(-4)}`
}

export default function InvoicesClient({ businessId, businessName, accounts }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)

  const perPage = 20
  const totalPages = Math.ceil(total / perPage)

  const assetAccounts = useMemo(() => accounts.filter((account) => account.type === 'ASSET'), [accounts])

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        business_id: businessId,
        page: String(page),
        limit: String(perPage),
        status,
        ...(search && { search }),
      })
      const response = await fetch(`/api/invoices?${params}`)
      const json: Paginated<Invoice> = await response.json()
      if (!response.ok) throw new Error(json.error || 'Gagal memuat invoice')
      setInvoices(json.data || [])
      setTotal(json.total || 0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat invoice'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [businessId, page, search, status])

  const fetchCustomers = useCallback(async () => {
    const response = await fetch(`/api/customers?business_id=${businessId}&limit=100`)
    const json: Paginated<Customer> = await response.json().catch(() => ({ data: [] }))
    if (response.ok) setCustomers(json.data || [])
  }, [businessId])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useEffect(() => { fetchCustomers() }, [fetchCustomers])
  useEffect(() => { setPage(1) }, [search, status])

  const handleDelete = async (invoice: Invoice) => {
    if (!confirm(`Hapus invoice ${invoice.invoice_number}?`)) return
    const response = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' })
    if (response.ok) {
      toast.success('Invoice dihapus')
      fetchInvoices()
    } else {
      const body = await response.json().catch(() => null)
      toast.error(body?.error || 'Gagal menghapus invoice')
    }
  }

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Penjualan</p>
          <h1 className="page-title flex items-center gap-2">
            <ReceiptText size={24} className="text-brand-400" />
            Invoice & Piutang
          </h1>
          <p className="page-subtitle">{businessName} - {total} invoice</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowCustomerForm(true)}
            className="btn-secondary"
          >
            <UserPlus size={15} />
            Customer
          </button>
          <button
            onClick={() => setShowInvoiceForm(true)}
            className="btn-primary"
          >
            <Plus size={15} />
            Invoice
          </button>
        </div>
      </div>

      <div className="panel-soft flex flex-wrap gap-3 p-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nomor invoice..."
            className="input pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="input w-auto"
        >
          <option value="all">Semua status</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        {(search || status !== 'all') && (
          <button
            onClick={() => { setSearch(''); setStatus('all') }}
            className="btn-secondary"
          >
            <X size={13} /> Reset
          </button>
        )}
      </div>

      <div className="table-shell">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-brand-400" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchInvoices} />
        ) : invoices.length === 0 ? (
          <EmptyState hasFilters={Boolean(search || status !== 'all')} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-head">
                    {['Invoice', 'Customer', 'Tanggal', 'Status', 'Total', 'Sisa', ''].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left text-xs font-medium text-surface-400">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <InvoiceRow
                      key={invoice.id}
                      invoice={invoice}
                      onPay={setPaymentInvoice}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-surface-700">
              {invoices.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  onPay={setPaymentInvoice}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-surface-400">Halaman {page} dari {totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page === 1}
              aria-label="Halaman invoice sebelumnya"
              className="p-2 rounded-lg border border-surface-700 text-surface-400 hover:text-white hover:border-surface-600 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={page === totalPages}
              aria-label="Halaman invoice berikutnya"
              className="p-2 rounded-lg border border-surface-700 text-surface-400 hover:text-white hover:border-surface-600 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {showInvoiceForm && (
        <InvoiceModal
          businessId={businessId}
          customers={customers}
          assetAccounts={assetAccounts}
          onClose={() => setShowInvoiceForm(false)}
          onSaved={(postingMessage) => {
            setShowInvoiceForm(false)
            fetchInvoices()
            if (postingMessage) toast(postingMessage, { icon: 'i' })
          }}
        />
      )}

      {showCustomerForm && (
        <CustomerModal
          businessId={businessId}
          onClose={() => setShowCustomerForm(false)}
          onSaved={() => {
            setShowCustomerForm(false)
            fetchCustomers()
          }}
        />
      )}

      {paymentInvoice && (
        <PaymentModal
          businessId={businessId}
          invoice={paymentInvoice}
          assetAccounts={assetAccounts}
          onClose={() => setPaymentInvoice(null)}
          onSaved={() => {
            setPaymentInvoice(null)
            fetchInvoices()
          }}
        />
      )}
    </div>
  )
}

function StatusPill({ status }: { status: Invoice['status'] }) {
  const styles: Record<Invoice['status'], string> = {
    draft: 'bg-surface-700 text-surface-300',
    issued: 'bg-amber-500/15 text-amber-300',
    paid: 'bg-brand-500/15 text-brand-300',
    void: 'bg-red-500/15 text-red-300',
  }
  return <span className={`text-xs px-2 py-1 rounded-full ${styles[status]}`}>{status}</span>
}

function InvoiceRow({
  invoice,
  onPay,
  onDelete,
}: {
  invoice: Invoice
  onPay: (invoice: Invoice) => void
  onDelete: (invoice: Invoice) => void
}) {
  return (
    <tr className="table-row">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-white">{invoice.invoice_number}</p>
        <p className="text-xs text-surface-500">{invoice.items?.length || 0} item</p>
      </td>
      <td className="px-4 py-3 text-sm text-surface-300">{invoice.customer?.name || '-'}</td>
      <td className="px-4 py-3 text-sm text-surface-400">
        {formatDate(invoice.issue_date)}
        {invoice.due_date && <p className="text-xs text-surface-500">Jatuh tempo {formatDate(invoice.due_date)}</p>}
      </td>
      <td className="px-4 py-3"><StatusPill status={invoice.status} /></td>
      <td className="px-4 py-3 text-sm font-mono text-surface-200">{formatIDR(Number(invoice.total_amount))}</td>
      <td className="px-4 py-3 text-sm font-mono text-surface-200">{formatIDR(Number(invoice.balance_due))}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {invoice.status === 'issued' && (
            <button
              onClick={() => onPay(invoice)}
              className="p-1.5 rounded-lg text-surface-500 hover:text-brand-400 hover:bg-brand-500/10"
              aria-label="Catat pembayaran"
            >
              <Banknote size={14} />
            </button>
          )}
          {invoice.status === 'draft' && (
            <button
              onClick={() => onDelete(invoice)}
              className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10"
              aria-label="Hapus invoice"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function InvoiceCard({
  invoice,
  onPay,
  onDelete,
}: {
  invoice: Invoice
  onPay: (invoice: Invoice) => void
  onDelete: (invoice: Invoice) => void
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{invoice.invoice_number}</p>
          <p className="text-xs text-surface-500">{invoice.customer?.name || 'Tanpa customer'} - {formatDate(invoice.issue_date)}</p>
        </div>
        <StatusPill status={invoice.status} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-surface-500">Sisa piutang</p>
          <p className="text-sm font-semibold text-white">{formatIDR(Number(invoice.balance_due))}</p>
        </div>
        <div className="flex gap-2">
          {invoice.status === 'issued' && (
            <button onClick={() => onPay(invoice)} className="p-2 rounded-lg text-brand-300 bg-brand-500/10" aria-label="Catat pembayaran">
              <Banknote size={15} />
            </button>
          )}
          {invoice.status === 'draft' && (
            <button onClick={() => onDelete(invoice)} className="p-2 rounded-lg text-red-300 bg-red-500/10" aria-label="Hapus invoice">
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function InvoiceModal({
  businessId,
  customers,
  assetAccounts,
  onClose,
  onSaved,
}: {
  businessId: string
  customers: Customer[]
  assetAccounts: AccountOption[]
  onClose: () => void
  onSaved: (postingMessage?: string) => void
}) {
  const [invoiceNumber, setInvoiceNumber] = useState(nextInvoiceNumber)
  const [customerId, setCustomerId] = useState('')
  const [issueDate, setIssueDate] = useState(today)
  const [dueDate, setDueDate] = useState(addDays(14))
  const [status, setStatus] = useState<'draft' | 'issued' | 'paid'>('draft')
  const [ppnEnabled, setPpnEnabled] = useState(false)
  const [npwp, setNpwp] = useState('')
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState(assetAccounts[0]?.id || '')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<InvoiceLine[]>([
    { description: '', quantity: '1', unit_price: '' },
  ])
  const [saving, setSaving] = useState(false)

  const subtotal = lines.reduce((sum, line) => {
    return sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0)
  }, 0)
  const ppnAmount = ppnEnabled ? subtotal * 0.11 : 0
  const total = subtotal + ppnAmount

  const addLine = () => setLines((current) => [...current, { description: '', quantity: '1', unit_price: '' }])
  const updateLine = (index: number, key: keyof InvoiceLine, value: string) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line))
  }
  const removeLine = (index: number) => {
    setLines((current) => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index))
  }

  const submit = async () => {
    const items = lines
      .filter((line) => line.description.trim() && Number(line.quantity) > 0)
      .map((line) => ({
        description: line.description.trim(),
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price) || 0,
        discount_amount: 0,
      }))

    if (!invoiceNumber.trim()) { toast.error('Nomor invoice wajib diisi'); return }
    if (items.length === 0) { toast.error('Minimal satu item invoice'); return }
    if (total <= 0) { toast.error('Total invoice harus lebih dari 0'); return }

    setSaving(true)
    const response = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        customer_id: customerId || null,
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        due_date: dueDate || null,
        status,
        ppn_rate: ppnEnabled ? 0.11 : 0,
        npwp: npwp || null,
        tax_invoice_number: taxInvoiceNumber || null,
        tax_invoice_status: taxInvoiceNumber ? 'metadata' : null,
        payment_account_id: status === 'paid' ? paymentAccountId || null : null,
        notes: notes || null,
        items,
      }),
    })
    const body = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok) {
      toast.error(body?.error || 'Gagal menyimpan invoice')
      return
    }

    toast.success('Invoice disimpan')
    onSaved(body?.accounting_posting_status === 'kept_as_draft' ? body.accounting_posting_reason : undefined)
  }

  return (
    <ModalFrame title="Buat Invoice" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nomor Invoice">
            <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className="input" />
          </Field>
          <Field label="Customer">
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="input">
              <option value="">Tanpa customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </Field>
          <Field label="Tanggal Invoice">
            <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="input [color-scheme:dark]" />
          </Field>
          <Field label="Jatuh Tempo">
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="input [color-scheme:dark]" />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value as 'draft' | 'issued' | 'paid')} className="input">
              <option value="draft">Draft</option>
              <option value="issued">Issued + posting jurnal</option>
              <option value="paid">Paid + posting pembayaran</option>
            </select>
          </Field>
          {status === 'paid' && (
            <Field label="Akun Terima Pembayaran">
              <select value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)} className="input">
                {assetAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
              </select>
            </Field>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-surface-300">Item Invoice</p>
            <button onClick={addLine} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              <Plus size={12} /> Tambah
            </button>
          </div>
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-12 gap-2">
              <input
                value={line.description}
                onChange={(event) => updateLine(index, 'description', event.target.value)}
                placeholder="Deskripsi"
                className="col-span-6 input"
              />
              <input
                type="number"
                value={line.quantity}
                onChange={(event) => updateLine(index, 'quantity', event.target.value)}
                min="0"
                className="col-span-2 input"
              />
              <input
                type="number"
                value={line.unit_price}
                onChange={(event) => updateLine(index, 'unit_price', event.target.value)}
                min="0"
                placeholder="Harga"
                className="col-span-3 input"
              />
              <button onClick={() => removeLine(index)} className="col-span-1 text-surface-500 hover:text-red-400 flex justify-center items-center" aria-label="Hapus item invoice">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="NPWP Metadata">
            <input value={npwp} onChange={(event) => setNpwp(event.target.value)} placeholder="Opsional" className="input" />
          </Field>
          <Field label="Nomor Faktur Pajak Metadata">
            <input value={taxInvoiceNumber} onChange={(event) => setTaxInvoiceNumber(event.target.value)} placeholder="Opsional" className="input" />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-surface-300">
          <input type="checkbox" checked={ppnEnabled} onChange={(event) => setPpnEnabled(event.target.checked)} />
          Hitung PPN 11% sebagai metadata invoice
        </label>

        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Catatan invoice"
          className="input min-h-20 resize-none"
        />

        <div className="flex justify-end gap-8 border-t border-surface-700 pt-4">
          <Summary label="Subtotal" value={formatIDR(subtotal)} />
          <Summary label="PPN" value={formatIDR(ppnAmount)} />
          <Summary label="Total" value={formatIDR(total)} />
        </div>

        <button
          onClick={submit}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {saving ? 'Menyimpan...' : 'Simpan Invoice'}
        </button>
      </div>
    </ModalFrame>
  )
}

function CustomerModal({ businessId, onClose, onSaved }: { businessId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [npwp, setNpwp] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) { toast.error('Nama customer wajib diisi'); return }
    setSaving(true)
    const response = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, name, email: email || null, phone: phone || null, npwp: npwp || null }),
    })
    const body = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok) {
      toast.error(body?.error || 'Gagal menyimpan customer')
      return
    }
    toast.success('Customer disimpan')
    onSaved()
  }

  return (
    <ModalFrame title="Tambah Customer" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nama">
          <input value={name} onChange={(event) => setName(event.target.value)} className="input" />
        </Field>
        <Field label="Email">
          <input value={email} onChange={(event) => setEmail(event.target.value)} className="input" />
        </Field>
        <Field label="Telepon">
          <input value={phone} onChange={(event) => setPhone(event.target.value)} className="input" />
        </Field>
        <Field label="NPWP">
          <input value={npwp} onChange={(event) => setNpwp(event.target.value)} className="input" />
        </Field>
        <button onClick={submit} disabled={saving} className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {saving ? 'Menyimpan...' : 'Simpan Customer'}
        </button>
      </div>
    </ModalFrame>
  )
}

function PaymentModal({
  businessId,
  invoice,
  assetAccounts,
  onClose,
  onSaved,
}: {
  businessId: string
  invoice: Invoice
  assetAccounts: AccountOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const remaining = Number(invoice.balance_due || 0)
  const [amount, setAmount] = useState(String(remaining))
  const [method, setMethod] = useState('transfer')
  const [reference, setReference] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState(assetAccounts[0]?.id || '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (Number(amount) <= 0) { toast.error('Nominal pembayaran tidak valid'); return }
    setSaving(true)
    const response = await fetch(`/api/invoices/${invoice.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        amount: Number(amount),
        method,
        reference: reference || null,
        payment_account_id: paymentAccountId || null,
      }),
    })
    const body = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok) {
      toast.error(body?.error || 'Gagal mencatat pembayaran')
      return
    }
    toast.success('Pembayaran dicatat')
    onSaved()
  }

  return (
    <ModalFrame title={`Pembayaran ${invoice.invoice_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-surface-800 border border-surface-700 p-4">
          <p className="text-xs text-surface-500">Sisa tagihan</p>
          <p className="text-lg font-semibold text-white">{formatIDR(remaining)}</p>
        </div>
        <Field label="Nominal">
          <input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="input" />
        </Field>
        <Field label="Metode">
          <select value={method} onChange={(event) => setMethod(event.target.value)} className="input">
            <option value="transfer">Transfer</option>
            <option value="cash">Cash</option>
            <option value="qris">QRIS</option>
            <option value="provider">Provider</option>
          </select>
        </Field>
        <Field label="Akun Kas/Bank">
          <select value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)} className="input">
            {assetAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
          </select>
        </Field>
        <Field label="Referensi">
          <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Opsional" className="input" />
        </Field>
        <button onClick={submit} disabled={saving} className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
          {saving ? 'Menyimpan...' : 'Catat Pembayaran'}
        </button>
      </div>
    </ModalFrame>
  )
}

function ModalFrame({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface-900/95 backdrop-blur flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-surface-500 hover:text-white p-1" aria-label="Tutup modal">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-surface-300 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-xs text-surface-500">{label}</p>
      <p className="text-sm font-semibold font-mono text-white">{value}</p>
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="text-center py-16 text-surface-500">
      <FileText size={36} className="mx-auto mb-3 opacity-30" />
      <p className="text-sm">{hasFilters ? 'Tidak ada invoice yang cocok dengan filter' : 'Belum ada invoice'}</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="text-center py-16 text-surface-400">
      <AlertCircle size={36} className="mx-auto mb-3 text-red-400" />
      <p className="text-sm">{message}</p>
      <button onClick={onRetry} className="mt-4 px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-sm text-white">
        Coba Lagi
      </button>
    </div>
  )
}
