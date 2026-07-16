<script setup lang="ts">
import { invoiceDateDisplay, moneyDisplay } from '~/utils/invoices-ui'
import { portalInvoiceStatus } from '~/utils/portal-dashboard-ui'
import {
  portalInvoiceApplyListFilters,
  portalInvoiceDefaultListFilters,
  portalInvoiceFilterLabel,
  portalInvoiceListFiltersDirty,
  portalInvoiceListSublabel,
  portalInvoiceVehicleOptions,
  type PortalInvoiceFilter,
  type PortalInvoiceListRow,
  type PortalInvoiceSort,
} from '~/utils/portal-invoices-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const filters = reactive(portalInvoiceDefaultListFilters())

const { data, error, pending } = useClientFetch<{ items: PortalInvoiceListRow[] }>('/api/portal/invoices')

const items = computed(() => data.value?.items ?? [])

const filtered = computed(() => portalInvoiceApplyListFilters(items.value, filters))

const vehicleOptions = computed(() => portalInvoiceVehicleOptions(items.value))

const statusOptions: PortalInvoiceFilter[] = ['all', 'open', 'paid']

const filtersDirty = computed(() => portalInvoiceListFiltersDirty(filters))

function clearFilters() {
  Object.assign(filters, portalInvoiceDefaultListFilters())
}

const countLabel = computed(() => {
  if (pending.value && !items.value.length) return 'Loading…'
  const n = filtered.value.length
  if (!n) return 'No invoices'
  return `${n} invoice${n === 1 ? '' : 's'}`
})
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
        v-model:search="filters.q"
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
            <select v-model="filters.status" aria-label="Invoice status">
              <option v-for="opt in statusOptions" :key="opt" :value="opt">
                {{ portalInvoiceFilterLabel(opt) }}
              </option>
            </select>
          </label>
          <label class="fld">
            Vehicle
            <select v-model="filters.vehicleId" aria-label="Filter by vehicle">
              <option value="all">All vehicles</option>
              <option v-for="veh in vehicleOptions" :key="veh.id" :value="veh.id">
                {{ veh.label }}
              </option>
            </select>
          </label>
          <label class="fld">
            Issued from
            <input v-model="filters.dateFrom" type="date" aria-label="Issued from date">
          </label>
          <label class="fld">
            Issued to
            <input v-model="filters.dateTo" type="date" aria-label="Issued to date">
          </label>
          <label class="fld">
            Min amount
            <input
              v-model="filters.amountMin"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              aria-label="Minimum invoice amount"
            >
          </label>
          <label class="fld">
            Max amount
            <input
              v-model="filters.amountMax"
              type="number"
              min="0"
              step="0.01"
              placeholder="Any"
              aria-label="Maximum invoice amount"
            >
          </label>
          <label class="fld">
            Sort by
            <select v-model="filters.sort" aria-label="Sort invoices">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="vehicle">Vehicle</option>
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
          <table class="tbl inv-tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Vehicle</th>
                <th>Issued</th>
                <th>Status</th>
                <th class="num">Amount</th>
                <th class="col-actions" aria-label="Actions" />
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
                <td class="col-actions">
                  <PortalInvoiceListRowActions :invoice-id="inv.id" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
