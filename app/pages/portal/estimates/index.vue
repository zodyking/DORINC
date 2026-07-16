<script setup lang="ts">
import { invoiceDateDisplay, moneyDisplay } from '~/utils/invoices-ui'
import {
  portalEstimateFilterLabel,
  portalEstimateListSublabel,
  portalEstimateMatchesFilter,
  portalEstimateStatus,
  type PortalEstimateFilter,
} from '~/utils/portal-estimates-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

interface PortalEstimateRow {
  id: string
  estimateNumberFormatted: string
  status: string
  estimateDate: string
  validUntil: string | null
  total: string
  vehicleLabel: string
  canRespond: boolean
}

type PortalEstimateSort = 'newest' | 'oldest' | 'amount_high' | 'amount_low'

const q = ref('')
const filter = ref<PortalEstimateFilter>('all')
const fSort = ref<PortalEstimateSort>('newest')

const { data, error, pending } = useClientFetch<{ items: PortalEstimateRow[] }>('/api/portal/estimates')

const items = computed(() => data.value?.items ?? [])

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  let rows = items.value.filter(est => portalEstimateMatchesFilter(est.status, filter.value))
  if (needle) {
    rows = rows.filter(est =>
      est.estimateNumberFormatted.toLowerCase().includes(needle)
      || est.vehicleLabel.toLowerCase().includes(needle),
    )
  }
  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (fSort.value === 'oldest') return a.estimateDate.localeCompare(b.estimateDate)
    if (fSort.value === 'amount_high') return Number.parseFloat(b.total) - Number.parseFloat(a.total)
    if (fSort.value === 'amount_low') return Number.parseFloat(a.total) - Number.parseFloat(b.total)
    return b.estimateDate.localeCompare(a.estimateDate)
  })
  return sorted
})

const statusOptions: PortalEstimateFilter[] = ['all', 'pending', 'approved', 'rejected']

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
  if (!n) return 'No estimates'
  return `${n} estimate${n === 1 ? '' : 's'}`
})
</script>

<template>
  <section class="page active portal-page">
    <div v-if="error" class="card">
      <div class="empty">Unable to load estimates.</div>
    </div>

    <template v-else>
      <PortalPageHead subtitle="Pending and approved repair quotes">
        <template #title>Estimates</template>
      </PortalPageHead>

      <ListFilterBar
        v-model:search="q"
        search-placeholder="Search estimates, vehicles…"
        search-aria-label="Search estimates"
        :count-label="countLabel"
        :filters-active="filtersDirty"
        filter-title="Filter estimates"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <label class="fld">
            Status
            <select v-model="filter" aria-label="Estimate status">
              <option v-for="opt in statusOptions" :key="opt" :value="opt">
                {{ portalEstimateFilterLabel(opt) }}
              </option>
            </select>
          </label>
          <label class="fld">
            Sort by
            <select v-model="fSort" aria-label="Sort estimates">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount_high">Amount: high to low</option>
              <option value="amount_low">Amount: low to high</option>
            </select>
          </label>
        </template>
      </ListFilterBar>

      <div class="card">
        <div v-if="pending && !items.length" class="empty">Loading estimates…</div>
        <div v-else-if="!filtered.length" class="empty">No estimates match your filters.</div>
        <div v-else class="tscroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Estimate</th>
                <th>Vehicle</th>
                <th>Date</th>
                <th>Status</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="est in filtered"
                :key="est.id"
                class="click"
                @click="navigateTo(`/portal/estimates/${est.id}`)"
              >
                <td>
                  <span class="lead">{{ est.estimateNumberFormatted }}</span>
                  <span class="sub">{{ portalEstimateListSublabel(est.status, est.validUntil, est.estimateDate) }}</span>
                </td>
                <td>{{ est.vehicleLabel }}</td>
                <td>{{ invoiceDateDisplay(est.estimateDate) }}</td>
                <td>
                  <span :class="portalEstimateStatus(est.status).cls">
                    {{ portalEstimateStatus(est.status).label }}
                  </span>
                </td>
                <td class="num">{{ moneyDisplay(est.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
