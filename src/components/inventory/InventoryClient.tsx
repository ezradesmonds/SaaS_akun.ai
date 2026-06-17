'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Boxes, Filter, Loader2, MapPin, PackagePlus, Plus,
  RefreshCw, Search, Warehouse, X
} from 'lucide-react'
import toast from 'react-hot-toast'

type InventoryLocation = {
  id: string
  name: string
  code?: string | null
  is_active: boolean
}

type InventoryProduct = {
  id: string
  sku?: string | null
  name: string
  description?: string | null
  unit: string
  low_stock_threshold: number
  current_stock: number
  last_movement_at?: string | null
  is_low_stock: boolean
}

type MovementType = 'initial' | 'purchase' | 'sale' | 'adjustment' | 'transfer'

type Props = {
  businessId: string
  businessName: string
}

const MOVEMENT_OPTIONS: { value: MovementType; label: string; sign: 1 | -1 }[] = [
  { value: 'purchase', label: 'Stok Masuk', sign: 1 },
  { value: 'sale', label: 'Stok Keluar', sign: -1 },
  { value: 'adjustment', label: 'Adjustment', sign: 1 },
  { value: 'initial', label: 'Saldo Awal', sign: 1 },
]

function formatQty(value: number, unit: string) {
  return `${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${unit}`
}

function formatDate(value?: string | null) {
  if (!value) return 'Belum ada mutasi'
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function InventoryClient({ businessId, businessName }: Props) {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [locationId, setLocationId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [movementProduct, setMovementProduct] = useState<InventoryProduct | null>(null)

  const loadInventory = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const productParams = new URLSearchParams({
        business_id: businessId,
        ...(locationId && { location_id: locationId }),
        ...(search && { search }),
      })
      const locationParams = new URLSearchParams({ business_id: businessId })

      const [productsRes, locationsRes] = await Promise.all([
        fetch(`/api/inventory/products?${productParams}`),
        fetch(`/api/inventory/locations?${locationParams}`),
      ])

      const productsJson = await productsRes.json()
      const locationsJson = await locationsRes.json()

      if (!productsRes.ok) throw new Error(productsJson.error || 'Gagal memuat produk')
      if (!locationsRes.ok) throw new Error(locationsJson.error || 'Gagal memuat lokasi')

      setProducts(productsJson.data || [])
      setLocations(locationsJson.data || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat inventory'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [businessId, locationId, search])

  useEffect(() => { loadInventory() }, [loadInventory])

  const lowStockProducts = useMemo(
    () => products.filter((product) => product.is_low_stock),
    [products],
  )

  const totalStock = useMemo(
    () => products.reduce((sum, product) => sum + Number(product.current_stock || 0), 0),
    [products],
  )

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Operasional</p>
          <h1 className="page-title flex items-center gap-2">
            <Boxes size={24} className="text-brand-400" />
            Inventory
          </h1>
          <p className="page-subtitle">{businessName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowLocationForm(true)}
            className="btn-secondary"
          >
            <MapPin size={15} />
            Lokasi
          </button>
          <button
            onClick={() => setShowProductForm(true)}
            className="btn-primary"
          >
            <PackagePlus size={15} />
            Produk
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Produk aktif" value={products.length.toLocaleString('id-ID')} icon={Boxes} />
        <StatCard label="Total stok" value={totalStock.toLocaleString('id-ID', { maximumFractionDigits: 2 })} icon={Warehouse} />
        <StatCard label="Low stock" value={lowStockProducts.length.toLocaleString('id-ID')} icon={AlertCircle} danger={lowStockProducts.length > 0} />
      </div>

      {lowStockProducts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-200">Perlu restock</p>
              <p className="text-xs text-amber-300/80 mt-1">
                {lowStockProducts.slice(0, 3).map((product) => product.name).join(', ')}
                {lowStockProducts.length > 3 ? ` dan ${lowStockProducts.length - 3} produk lain` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="panel-soft flex flex-col gap-3 p-3 md:flex-row">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama atau SKU..."
            className="input pl-9"
          />
        </div>
        <div className="relative md:w-64">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            className="input pl-9"
          >
            <option value="">Semua lokasi</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        {(search || locationId) && (
          <button
            onClick={() => { setSearch(''); setLocationId('') }}
            className="btn-secondary"
          >
            <X size={13} />
            Reset
          </button>
        )}
        <button
          onClick={loadInventory}
          className="btn-icon"
          aria-label="Refresh inventory"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="table-shell">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-brand-400" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={loadInventory} />
        ) : products.length === 0 ? (
          <EmptyState hasFilters={Boolean(search || locationId)} onCreate={() => setShowProductForm(true)} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-head">
                    {['Produk', 'SKU', 'Stok', 'Minimum', 'Status', 'Update', ''].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left text-xs font-medium text-surface-400">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <ProductRow key={product.id} product={product} onMovement={setMovementProduct} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-surface-700">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} onMovement={setMovementProduct} />
              ))}
            </div>
          </>
        )}
      </div>

      {showProductForm && (
        <ProductModal
          businessId={businessId}
          locations={locations}
          onClose={() => setShowProductForm(false)}
          onSaved={() => { setShowProductForm(false); loadInventory() }}
        />
      )}

      {showLocationForm && (
        <LocationModal
          businessId={businessId}
          onClose={() => setShowLocationForm(false)}
          onSaved={() => { setShowLocationForm(false); loadInventory() }}
        />
      )}

      {movementProduct && (
        <MovementModal
          businessId={businessId}
          product={movementProduct}
          locations={locations}
          onClose={() => setMovementProduct(null)}
          onSaved={() => { setMovementProduct(null); loadInventory() }}
        />
      )}
    </div>
  )
}

function StatCard({
  label, value, icon: Icon, danger = false
}: {
  label: string
  value: string
  icon: typeof Boxes
  danger?: boolean
}) {
  return (
    <div className="premium-card premium-card-hover p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-surface-500">{label}</p>
        <p className={`text-lg font-semibold mt-1 ${danger ? 'text-amber-300' : 'text-white'}`}>{value}</p>
      </div>
      <Icon size={18} className={danger ? 'text-amber-400' : 'text-brand-400'} />
    </div>
  )
}

function ProductRow({ product, onMovement }: { product: InventoryProduct; onMovement: (product: InventoryProduct) => void }) {
  return (
    <tr className="table-row">
      <td className="px-4 py-3">
        <p className="text-sm text-white">{product.name}</p>
        {product.description && <p className="text-xs text-surface-500 truncate max-w-64">{product.description}</p>}
      </td>
      <td className="px-4 py-3 text-xs font-mono text-surface-400">{product.sku || '-'}</td>
      <td className="px-4 py-3 text-sm font-semibold text-white">{formatQty(product.current_stock, product.unit)}</td>
      <td className="px-4 py-3 text-sm text-surface-300">{formatQty(product.low_stock_threshold, product.unit)}</td>
      <td className="px-4 py-3">
        <StockBadge isLow={product.is_low_stock} />
      </td>
      <td className="px-4 py-3 text-xs text-surface-500">{formatDate(product.last_movement_at)}</td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onMovement(product)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-700 text-xs text-surface-200 hover:bg-surface-600"
        >
          <Plus size={12} />
          Mutasi
        </button>
      </td>
    </tr>
  )
}

function ProductCard({ product, onMovement }: { product: InventoryProduct; onMovement: (product: InventoryProduct) => void }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{product.name}</p>
          <p className="text-xs text-surface-500 mt-1">{product.sku || 'Tanpa SKU'} - {formatDate(product.last_movement_at)}</p>
        </div>
        <StockBadge isLow={product.is_low_stock} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-surface-500">Stok</p>
          <p className="text-base font-semibold text-white">{formatQty(product.current_stock, product.unit)}</p>
        </div>
        <button
          onClick={() => onMovement(product)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-700 text-xs text-surface-200 hover:bg-surface-600"
        >
          <Plus size={12} />
          Mutasi
        </button>
      </div>
    </div>
  )
}

function StockBadge({ isLow }: { isLow: boolean }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${isLow ? 'bg-amber-500/15 text-amber-300' : 'bg-brand-500/15 text-brand-400'}`}>
      {isLow ? 'Low stock' : 'Aman'}
    </span>
  )
}

function EmptyState({ hasFilters, onCreate }: { hasFilters: boolean; onCreate: () => void }) {
  return (
    <div className="text-center py-16 text-surface-500">
      <Boxes size={36} className="mx-auto mb-3 opacity-30" />
      <p className="text-sm">{hasFilters ? 'Tidak ada produk yang cocok' : 'Belum ada produk inventory'}</p>
      {!hasFilters && (
        <button
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 text-sm text-white hover:bg-brand-400"
        >
          <PackagePlus size={14} />
          Tambah Produk
        </button>
      )}
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

function ProductModal({
  businessId, locations, onClose, onSaved
}: {
  businessId: string
  locations: InventoryLocation[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('pcs')
  const [lowStock, setLowStock] = useState('0')
  const [initialStock, setInitialStock] = useState('')
  const [locationId, setLocationId] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { toast.error('Isi nama produk'); return }
    setSaving(true)
    const res = await fetch('/api/inventory/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        name,
        sku: sku || undefined,
        unit,
        low_stock_threshold: Number(lowStock) || 0,
        initial_stock: initialStock ? Number(initialStock) : undefined,
        location_id: locationId || undefined,
      }),
    })
    setSaving(false)
    const body = await res.json().catch(() => null)
    if (!res.ok) { toast.error(body?.error || 'Gagal menambah produk'); return }
    toast.success('Produk ditambahkan')
    onSaved()
  }

  return (
    <Modal title="Tambah Produk" onClose={onClose}>
      <div className="space-y-4">
        <Input label="Nama produk" value={name} onChange={setName} placeholder="Kopi Arabica 250g" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="SKU" value={sku} onChange={setSku} placeholder="SKU-001" />
          <Input label="Unit" value={unit} onChange={setUnit} placeholder="pcs" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Minimum stok" value={lowStock} onChange={setLowStock} type="number" />
          <Input label="Stok awal" value={initialStock} onChange={setInitialStock} type="number" placeholder="0" />
        </div>
        <Select label="Lokasi stok awal" value={locationId} onChange={setLocationId}>
          <option value="">Tanpa lokasi</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </Select>
        <PrimaryButton loading={saving} onClick={save} label="Simpan Produk" icon={PackagePlus} />
      </div>
    </Modal>
  )
}

function LocationModal({
  businessId, onClose, onSaved
}: {
  businessId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { toast.error('Isi nama lokasi'); return }
    setSaving(true)
    const res = await fetch('/api/inventory/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, name, code: code || undefined }),
    })
    setSaving(false)
    const body = await res.json().catch(() => null)
    if (!res.ok) { toast.error(body?.error || 'Gagal menambah lokasi'); return }
    toast.success('Lokasi ditambahkan')
    onSaved()
  }

  return (
    <Modal title="Tambah Lokasi" onClose={onClose}>
      <div className="space-y-4">
        <Input label="Nama lokasi" value={name} onChange={setName} placeholder="Gudang Utama" />
        <Input label="Kode" value={code} onChange={setCode} placeholder="GDG" />
        <PrimaryButton loading={saving} onClick={save} label="Simpan Lokasi" icon={MapPin} />
      </div>
    </Modal>
  )
}

function MovementModal({
  businessId, product, locations, onClose, onSaved
}: {
  businessId: string
  product: InventoryProduct
  locations: InventoryLocation[]
  onClose: () => void
  onSaved: () => void
}) {
  const [movementType, setMovementType] = useState<MovementType>('purchase')
  const [quantity, setQuantity] = useState('')
  const [locationId, setLocationId] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const amount = Number(quantity)
    if (!amount || amount <= 0) { toast.error('Isi jumlah stok'); return }

    const option = MOVEMENT_OPTIONS.find((item) => item.value === movementType) || MOVEMENT_OPTIONS[0]
    const quantityDelta = option.sign * amount

    setSaving(true)
    const res = await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        product_id: product.id,
        location_id: locationId || undefined,
        movement_type: movementType,
        quantity_delta: quantityDelta,
        reference: reference || undefined,
        note: note || undefined,
      }),
    })
    setSaving(false)
    const body = await res.json().catch(() => null)
    if (!res.ok) { toast.error(body?.error || 'Gagal menyimpan mutasi'); return }
    toast.success('Mutasi stok disimpan')
    onSaved()
  }

  return (
    <Modal title={`Mutasi Stok: ${product.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-surface-700 bg-surface-800 p-3">
          <p className="text-xs text-surface-500">Stok saat ini</p>
          <p className="text-lg font-semibold text-white">{formatQty(product.current_stock, product.unit)}</p>
        </div>
        <Select label="Jenis mutasi" value={movementType} onChange={(value) => setMovementType(value as MovementType)}>
          {MOVEMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label={`Jumlah (${product.unit})`} value={quantity} onChange={setQuantity} type="number" placeholder="0" />
          <Select label="Lokasi" value={locationId} onChange={setLocationId}>
            <option value="">Tanpa lokasi</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </Select>
        </div>
        <Input label="Referensi" value={reference} onChange={setReference} placeholder="PO-001 / INV-001" />
        <Input label="Catatan" value={note} onChange={setNote} placeholder="Opsional" />
        <PrimaryButton loading={saving} onClick={save} label="Simpan Mutasi" icon={Plus} />
      </div>
    </Modal>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-surface-500 hover:text-white p-1" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Input({
  label, value, onChange, placeholder = '', type = 'text'
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-surface-300 mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-sm text-white placeholder:text-surface-600 focus:outline-none focus:border-brand-500"
      />
    </label>
  )
}

function Select({
  label, value, onChange, children
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-surface-300 mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-500"
      >
        {children}
      </select>
    </label>
  )
}

function PrimaryButton({
  loading, onClick, label, icon: Icon
}: {
  loading: boolean
  onClick: () => void
  label: string
  icon: typeof Plus
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {loading ? 'Menyimpan...' : label}
    </button>
  )
}
