<script setup lang="ts">
import {
  invoiceDateDisplay,
  invoiceStatusPill,
  moneyDisplay,
  vehicleSnapshotSub,
  type InvoiceStatus,
  type InvoiceVehicleSnapshotDisplay,
} from '~/utils/invoices-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { vehicleTag, type VehicleDisplay } from '~/utils/vehicles-ui'

definePageMeta({ layout: 'staff', permission: 'invoices.record_payment.all' })

type VehiclePick = VehicleDisplay & { id: string }
type StatusChip = 'open' | 'paid' | 'all' | 'overdue'

interface InvoiceRow {
  id: string
  invoiceNumber: number
  invoiceNumberFormatted: string
  status: InvoiceStatus
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
  amountPaid?: string
  customerId: string | null
  customerName: string
  vehicleSnapshot: InvoiceVehicleSnapshotDisplay | null
}

const auth = useAuthStore()
const canReconcile = computed(() => auth.loaded && auth.can('invoices.record_payment.all'))

const q = ref('')
const fStatus = ref<StatusChip>('open')
const fSort = ref<'newest' | 'oldest' | 'customer' | 'amount_high' | 'amount_low'>('newest')
const fCustomer = ref('all')
const fVehicle = ref('all')
const page = ref(1)
const PAGE_SIZE = 50

const selected = ref<Set<string>>(new Set())
const busy = ref(false)
const actionError = ref('')
const actionNote = ref('')

watch(fCustomer, () => { fVehicle.value = 'all' })
watch([q, fStatus, fSort, fCustomer, fVehicle], () => {
  page.value = 1
  selected.value = new Set()
})

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  status: fStatus.value === 'paid' ? 'paid' as const : fStatus.value === 'open' ? 'sent' as const : undefined,
  overdue: fStatus.value === 'overdue' ? true : undefined,
  customerId: fCustomer.value === 'all' ? undefined : fCustomer.value,
  vehicleId: fVehicle.value === 'all' ? undefined : fVehicle.value,
  sort: fSort.value,
}))

const {
  data,
  refresh,
  error: listError,
  pending,
} = useClientFetch<{ items: InvoiceRow[], total: number }>('/api/invoices', {
  query,
})

const { data: customersData, pending: customersPending } = useClientFetch<{ items: { id: string, displayName: string }[] }>(
  '/api/customers',
  { query: { pageSize: 200, sort: 'name-asc' } },
)

const { data: vehiclesData, pending: vehiclesPending } = useClientFetch<{ items: VehiclePick[] }>(
  () => (fCustomer.value === 'all' ? null : '/api/vehicles'),
  {
    query: computed(() => ({
      customerId: fCustomer.value === 'all' ? undefined : fCustomer.value,
      pageSize: 100,
      sort: 'tag-asc' as const,
    })),
    watch: [fCustomer],
  },
)

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const customerOptions = computed(() => customersData.value?.items ?? [])
const vehicleOptions = computed(() => vehiclesData.value?.items ?? [])
const pageError = computed(() =>
  listError.value ? syncFetchErrorMessage(listError.value, 'Could not load invoices') : null,
)

const filtersDirty = computed(() =>
  !!q.value
  || fStatus.value !== 'open'
  || fCustomer.value !== 'all'
  || fVehicle.value !== 'all'
  || fSort.value !== 'newest',
)

const allVisibleSelected = computed(() =>
  items.value.length > 0 && items.value.every(row => selected.value.has(row.id)),
)

const selectedCount = computed(() => selected.value.size)

function clearFilters() {
  q.value = ''
  fStatus.value = 'open'
  fCustomer.value = 'all'
  fVehicle.value = 'all'
  fSort.value = 'newest'
}

function toggleRow(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleAllVisible() {
  const next = new Set(selected.value)
  if (allVisibleSelected.value) {
    for (const row of items.value) next.delete(row.id)
  }
  else {
    for (const row of items.value) next.add(row.id)
  }
  selected.value = next
}

function canMarkPaid(row: InvoiceRow) {
  return row.status === 'sent' && Number.parseFloat(row.balanceDue) > 0
}

function canMarkUnpaid(row: InvoiceRow) {
  if (row.status === 'paid') return true
  return row.status === 'sent' && Number.parseFloat(row.amountPaid ?? '0') > 0
}

async function runAction(action: 'paid' | 'unpaid') {
  const ids = [...selected.value]
  if (!ids.length || busy.value) return

  const eligible = items.value.filter((row) => {
    if (!selected.value.has(row.id)) return false
    return action === 'paid' ? canMarkPaid(row) : canMarkUnpaid(row)
  }).map(row => row.id)

  // Also include selected ids not on current page — send all selected; server validates.
  const invoiceIds = ids.length ? ids : eligible
  if (!invoiceIds.length) {
    actionError.value = 'Select at least one invoice'
    return
  }

  busy.value = true
  actionError.value = ''
  actionNote.value = ''
  try {
    const res = await $fetch<{
      summary: { requested: number, ok: number, failed: number, action: string }
      results: Array<{ invoiceId: string, ok: boolean, error?: string }>
    }>('/api/invoices/bulk-reconcile', {
      method: 'POST',
      body: { invoiceIds, action },
    })

    const failedRows = res.results.filter(r => !r.ok)
    actionNote.value = res.summary.failed
      ? `Updated ${res.summary.ok} of ${res.summary.requested}. ${res.summary.failed} could not be updated.`
      : `Updated ${res.summary.ok} invoice${res.summary.ok === 1 ? '' : 's'} to ${action}.`

    if (failedRows.length && failedRows.length <= 5) {
      actionError.value = failedRows.map(r => r.error ?? 'Failed').join(' · ')
    }

    selected.value = new Set()
    await refresh()
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Reconciliation failed')
  }
  finally {
    busy.value = false
  }
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
</script>

<template>
  <section v-if="auth.loaded && !canReconcile" class="page active">
    <div class="cp-state">You do not have permission to reconcile invoice payments.</div>
  </section>

  <section v-else class="page active">
    <StaffPageHead subtitle="Bulk mark invoices paid or unpaid — team chat is notified automatically">
      <template #title>Invoice reconciliation</template>
      <template #actions>
        <NuxtLink to="/invoices" class="btn">Back to invoices</NuxtLink>
      </template>
    </StaffPageHead>

    <p v-if="actionError" class="help recon-error">{{ actionError }}</p>
    <p v-else-if="actionNote" class="help recon-ok">{{ actionNote }}</p>
    <div v-if="pageError" class="card" style="padding:16px; margin-bottom:16px;">
      <p style="margin:0 0 10px; color:#dc2626;">{{ pageError }}</p>
      <button type="button" class="btn" @click="refresh()">Retry</button>
    </div>

    <ListFilterBar
      v-model:search="q"
      search-placeholder="Search invoice #, customer, vehicle…"
      search-aria-label="Search invoices"
      :count-label="`${total} invoice${total === 1 ? '' : 's'}`"
      :filters-active="filtersDirty"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <label class="fld">
          Status
          <select v-model="fStatus" aria-label="Invoice status">
            <option value="open">Open (sent)</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="all">All statuses</option>
          </select>
        </label>
        <label class="fld">
          Customer
          <select v-model="fCustomer" aria-label="Filter by customer">
            <option value="all">All customers</option>
            <option v-for="c in customerOptions" :key="c.id" :value="c.id">{{ c.displayName }}</option>
          </select>
          <span v-if="customersPending" class="help">Loading customers…</span>
        </label>
        <label class="fld">
          Vehicle / unit
          <select v-model="fVehicle" :disabled="fCustomer === 'all'" aria-label="Filter by vehicle">
            <option value="all">All vehicles</option>
            <option v-for="v in vehicleOptions" :key="v.id" :value="v.id">{{ vehicleTag(v) }}</option>
          </select>
          <span v-if="fCustomer === 'all'" class="help">Select a customer first.</span>
          <span v-else-if="vehiclesPending" class="help">Loading vehicles…</span>
        </label>
        <label class="fld">
          Sort by
          <select v-model="fSort" aria-label="Sort invoices">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="customer">Customer (A–Z)</option>
            <option value="amount_high">Amount: high to low</option>
            <option value="amount_low">Amount: low to high</option>
          </select>
        </label>
      </template>
    </ListFilterBar>

    <div class="recon-bar">
      <div class="recon-bar-left">
        <span class="recon-selected">{{ selectedCount }} selected</span>
        <button type="button" class="btn sm" :disabled="!items.length" @click="toggleAllVisible">
          {{ allVisibleSelected ? 'Clear page' : 'Select page' }}
        </button>
      </div>
      <div class="recon-bar-actions">
        <button
          type="button"
          class="btn primary"
          :disabled="busy || !selectedCount"
          @click="runAction('paid')"
        >
          {{ busy ? 'Updating…' : 'Mark paid' }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="busy || !selectedCount"
          @click="runAction('unpaid')"
        >
          Mark unpaid
        </button>
      </div>
    </div>

    <div class="card">
      <div class="tscroll">
        <table v-if="items.length" class="tbl">
          <thead>
            <tr>
              <th class="recon-check">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="Select all on this page"
                  @change="toggleAllVisible"
                >
              </th>
              <th>Invoice</th>
              <th>Customer / Vehicle</th>
              <th>Issued</th>
              <th>Status</th>
              <th class="num">Balance</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in items"
              :key="row.id"
              class="click"
              @click="toggleRow(row.id)"
            >
              <td class="recon-check" @click.stop>
                <input
                  type="checkbox"
                  :checked="selected.has(row.id)"
                  :aria-label="`Select ${row.invoiceNumberFormatted}`"
                  @change="toggleRow(row.id)"
                >
              </td>
              <td>
                <NuxtLink :to="`/invoices/${row.id}`" class="lead" @click.stop>
                  {{ row.invoiceNumberFormatted }}
                </NuxtLink>
              </td>
              <td>
                <div class="lead">{{ row.customerName }}</div>
                <div class="help">{{ vehicleSnapshotSub(row.vehicleSnapshot) || '—' }}</div>
              </td>
              <td>{{ invoiceDateDisplay(row.invoiceDate) }}</td>
              <td>
                <span :class="invoiceStatusPill(row.status, row.dueDate, row.balanceDue).cls">
                  {{ invoiceStatusPill(row.status, row.dueDate, row.balanceDue).label }}
                </span>
              </td>
              <td class="num">{{ moneyDisplay(row.balanceDue) }}</td>
              <td class="num">{{ moneyDisplay(row.total) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="pending" class="cp-state">Loading invoices…</div>
        <div v-else class="cp-state">No invoices match these filters.</div>
      </div>
    </div>

    <div v-if="totalPages > 1" class="recon-pager">
      <button type="button" class="btn sm" :disabled="page <= 1 || busy" @click="page -= 1">Previous</button>
      <span class="help">Page {{ page }} of {{ totalPages }}</span>
      <button type="button" class="btn sm" :disabled="page >= totalPages || busy" @click="page += 1">Next</button>
    </div>
  </section>
</template>

<style scoped>
.recon-error { color: #dc2626; margin: 0 0 12px; }
.recon-ok { color: #15803d; margin: 0 0 12px; }
.recon-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.recon-bar-left,
.recon-bar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.recon-selected {
  font-weight: 650;
  min-width: 6.5rem;
}
.recon-check {
  width: 40px;
}
.recon-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 14px;
}
.lead {
  font-weight: 650;
  text-decoration: none;
  color: inherit;
}
</style>
