<script setup lang="ts">
import {
  portalInvoiceStatus,
  portalMoney,
  portalOpenBalanceSub,
  portalRecentInvoiceAmount,
} from '~/utils/portal-dashboard-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

interface PortalDashboardPayload {
  greeting: string
  subtext: string
  kpis: {
    openBalance: string
    openInvoiceCount: number
    vehicleCount: number
    paidYtdTotal: string
    paidYtdLabel: string
    pendingRequestCount: number
  }
  recentInvoices: Array<{
    id: string
    invoiceNumberFormatted: string
    sublabel: string
    vehicleLabel: string
    status: string
    total: string
    balanceDue: string
  }>
}

const { data: dash, error, pending } = useClientFetch<PortalDashboardPayload>('/api/portal/dashboard')
</script>

<template>
  <section class="page active portal-page">
    <div v-if="error" class="card portal-card">
      <p class="portal-empty">Unable to load your dashboard.</p>
    </div>

    <div v-else-if="pending && !dash" class="card portal-card">
      <p class="portal-muted" style="padding: 18px; margin: 0;">Loading dashboard…</p>
    </div>

    <template v-else-if="dash">
      <div class="pagehead portal-pagehead">
        <div>
          <h2>{{ dash.greeting }}</h2>
          <p>{{ dash.subtext }}</p>
        </div>
        <div v-if="dash.kpis.openInvoiceCount" class="actions">
          <NuxtLink to="/portal/invoices" class="btn primary">View open invoices</NuxtLink>
        </div>
      </div>

      <div class="portal-kpis">
        <div class="kpi">
          <div class="l">Open balance</div>
          <div class="v">{{ portalMoney(dash.kpis.openBalance) }}</div>
          <div class="s">{{ portalOpenBalanceSub(dash.kpis.openInvoiceCount) }}</div>
        </div>
        <div class="kpi">
          <div class="l">Fleet units</div>
          <div class="v">{{ dash.kpis.vehicleCount }}</div>
          <div class="s">{{ dash.kpis.pendingRequestCount ? `${dash.kpis.pendingRequestCount} open request(s)` : 'All caught up' }}</div>
        </div>
      </div>

      <div class="card portal-card">
        <div class="chead">
          <h3>Recent invoices</h3>
          <NuxtLink to="/portal/invoices" class="btn sm">View all</NuxtLink>
        </div>
        <div v-if="!dash.recentInvoices.length" class="portal-empty">
          No invoices yet.
        </div>
        <div v-else class="portal-list">
          <NuxtLink
            v-for="inv in dash.recentInvoices"
            :key="inv.id"
            :to="`/portal/invoices/${inv.id}`"
            class="portal-list-row"
          >
            <div class="portal-list-main">
              <b>{{ inv.invoiceNumberFormatted }}</b>
              <span>{{ inv.vehicleLabel }}</span>
            </div>
            <div class="portal-list-end">
              <span :class="portalInvoiceStatus(inv.status, null, inv.balanceDue).cls">
                {{ portalInvoiceStatus(inv.status, null, inv.balanceDue).label }}
              </span>
              <strong>{{ portalRecentInvoiceAmount(inv.status, inv.total, inv.balanceDue) }}</strong>
            </div>
          </NuxtLink>
        </div>
      </div>
    </template>
  </section>
</template>
