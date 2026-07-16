<script setup lang="ts">
// Customer portal estimates list — approve/reject workflow (P3-03).
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

const filter = ref<PortalEstimateFilter>('all')

const { data, error, pending } = useClientFetch<{ items: PortalEstimateRow[] }>('/api/portal/estimates')

const items = computed(() => data.value?.items ?? [])

const filtered = computed(() =>
  items.value.filter(est => portalEstimateMatchesFilter(est.status, filter.value)),
)

const chips: PortalEstimateFilter[] = ['all', 'pending', 'approved', 'rejected']
</script>

<template>
  <section class="page active portal-page">
    <div v-if="error" class="card portal-card">
      <p>Unable to load estimates.</p>
    </div>

    <div v-else-if="pending && !items.length" class="card portal-card">
      <p class="portal-muted">Loading estimates…</p>
    </div>

    <template v-else>
      <div class="pagehead portal-pagehead">
        <div>
          <h2>Estimates</h2>
          <p>Pending and approved repair quotes</p>
        </div>
      </div>

      <div class="card portal-card">
        <div class="chead">
          <button
            v-for="chip in chips"
            :key="chip"
            type="button"
            class="chip"
            :class="{ on: filter === chip }"
            @click="filter = chip"
          >
            {{ portalEstimateFilterLabel(chip) }}
          </button>
        </div>

        <div v-if="!filtered.length" class="portal-empty">
          No estimates match this filter.
        </div>

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
