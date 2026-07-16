<script setup lang="ts">
import { invoiceDateDisplay, moneyDisplay } from '~/utils/invoices-ui'
import { portalInvoiceStatus } from '~/utils/portal-dashboard-ui'
import {
  portalInvoiceFilterLabel,
  portalInvoiceListSublabel,
  portalInvoiceMatchesFilter,
  portalInvoicePdfUrl,
  type PortalInvoiceFilter,
} from '~/utils/portal-invoices-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

interface PortalInvoiceRow {
  id: string
  invoiceNumberFormatted: string
  status: string
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
  vehicleLabel: string
}

type PortalInvoiceSort = 'newest' | 'oldest' | 'amount_high' | 'amount_low'

const q = ref('')
const filter = ref<PortalInvoiceFilter>('all')
const fSort = ref<PortalInvoiceSort>('newest')

const { data, error, pending } = useClientFetch<{ items: PortalInvoiceRow[] }>('/api/portal/invoices')

const items = computed(() => data.value?.items ?? [])

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  let rows = items.value.filter(inv => portalInvoiceMatchesFilter(inv.status, inv.balanceDue, filter.value))
  if (needle) {
    rows = rows.filter(inv =>
      inv.invoiceNumberFormatted.toLowerCase().includes(needle)
      || inv.vehicleLabel.toLowerCase().includes(needle),
    )
  }
  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (fSort.value === 'oldest') return a.invoiceDate.localeCompare(b.invoiceDate)
    if (fSort.value === 'amount_high') return Number.parseFloat(b.total) - Number.parseFloat(a.total)
    if (fSort.value === 'amount_low') return Number.parseFloat(a.total) - Number.parseFloat(b.total)
    return b.invoiceDate.localeCompare(a.invoiceDate)
  })
  return sorted
})

const statusOptions: PortalInvoiceFilter[] = ['all', 'open', 'paid']

const filtersDirty = computed(() =>
  filter.value !== 'all' || fSort.value !== 'newest' || !!q.value.trim(),
)

function clearFilters() {
  q.value = ''
  filter.value = 'all'
  fSort.value = 'newest'
}

const countLabel = computed(() => {
  if (pending.value && !items.value.length) return 'Loading…'
  const n = filtered.value.length
  if (!n) return 'No invoices'
  return `${n} invoice${n === 1 ? '' : 's'}`
})

function downloadPdf(event: Event, invoiceId: string) {
  event.stopPropagation()
  window.location.href = portalInvoicePdfUrl(invoiceId)
}
</script>

<template>
  <section class="page active portal-page">
    <div v-if="error" class="card">
      <div class="empty">Unable to load invoices.</div>
    </div>

    <template v-else>
      <PortalPageHead subtitle="Open, paid, and past invoices">
        <template #title>Invoices</template>
      </PortalPageHead>

      <ListFilterBar
        v-model:search="q"
        search-placeholder="Search invoices, vehicles…"
        search-aria-label="Search invoices"
        :count-label="countLabel"
        :filters-active="filtersDirty"
        filter-title="Filter invoices"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <label class="fld">
            Status
            <select v-model="filter" aria-label="Invoice status">
              <option v-for="opt in statusOptions" :key="opt" :value="opt">
                {{ portalInvoiceFilterLabel(opt) }}
              </option>
            </select>
          </label>
          <label class="fld">
            Sort by
            <select v-model="fSort" aria-label="Sort invoices">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount_high">Amount: high to low</option>
              <option value="amount_low">Amount: low to high</option>
            </select>
          </label>
        </template>
      </ListFilterBar>

      <div class="card">
        <div v-if="pending && !items.length" class="empty">Loading invoices…</div>
        <div v-else-if="!filtered.length" class="empty">No invoices match your filters.</div>
        <div v-else class="tscroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Vehicle</th>
                <th>Issued</th>
                <th>Status</th>
                <th class="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in filtered"
                :key="inv.id"
                class="click"
                @click="navigateTo(`/portal/invoices/${inv.id}`)"
              >
                <td>
                  <span class="lead">{{ inv.invoiceNumberFormatted }}</span>
                  <span class="sub">{{ portalInvoiceListSublabel(inv.status, inv.dueDate, inv.invoiceDate) }}</span>
                </td>
                <td>{{ inv.vehicleLabel }}</td>
                <td>{{ invoiceDateDisplay(inv.invoiceDate) }}</td>
                <td>
                  <span :class="portalInvoiceStatus(inv.status, inv.dueDate, inv.balanceDue).cls">
                    {{ portalInvoiceStatus(inv.status, inv.dueDate, inv.balanceDue).label }}
                  </span>
                </td>
                <td class="num">{{ moneyDisplay(inv.total) }}</td>
                <td>
                  <button type="button" class="btn sm dl-pdf" @click="downloadPdf($event, inv.id)">
                    PDF
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
