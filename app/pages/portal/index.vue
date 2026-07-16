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
    <div v-if="error" class="card">
      <div class="empty">Unable to load your dashboard.</div>
    </div>

    <div v-else-if="pending && !dash" class="card">
      <div class="empty">Loading dashboard…</div>
    </div>

    <template v-else-if="dash">
      <PortalPageHead :subtitle="dash.subtext">
        <template #title>{{ dash.greeting }}</template>
        <template v-if="dash.kpis.openInvoiceCount" #actions>
          <NuxtLink to="/portal/invoices" class="btn primary">View open invoices</NuxtLink>
        </template>
      </PortalPageHead>

      <div class="kpis portal-kpis-row">
        <div class="kpi">
          <div class="t">Open balance</div>
          <div class="v">{{ portalMoney(dash.kpis.openBalance) }}</div>
          <div class="d flat">{{ portalOpenBalanceSub(dash.kpis.openInvoiceCount) }}</div>
        </div>
        <div class="kpi">
          <div class="t">Fleet units</div>
          <div class="v">{{ dash.kpis.vehicleCount }}</div>
          <div class="d flat">
            {{ dash.kpis.pendingRequestCount ? `${dash.kpis.pendingRequestCount} open request(s)` : 'All caught up' }}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="chead">
          <h3>Recent invoices</h3>
          <div class="right">
            <NuxtLink to="/portal/invoices" class="btn ghost sm">View all →</NuxtLink>
          </div>
        </div>
        <div class="tscroll">
          <table v-if="dash.recentInvoices.length" class="tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in dash.recentInvoices"
                :key="inv.id"
                class="click"
                @click="navigateTo(`/portal/invoices/${inv.id}`)"
              >
                <td>
                  <span class="lead">{{ inv.invoiceNumberFormatted }}</span>
                  <span class="sub">{{ inv.sublabel }}</span>
                </td>
                <td>{{ inv.vehicleLabel }}</td>
                <td>
                  <span :class="portalInvoiceStatus(inv.status, null, inv.balanceDue).cls">
                    {{ portalInvoiceStatus(inv.status, null, inv.balanceDue).label }}
                  </span>
                </td>
                <td class="num">{{ portalRecentInvoiceAmount(inv.status, inv.total, inv.balanceDue) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty">No invoices yet.</div>
        </div>
      </div>
    </template>
  </section>
</template>
