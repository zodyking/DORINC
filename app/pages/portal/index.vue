<script setup lang="ts">
// Customer portal dashboard — KPIs, recent invoices, open requests (mockup: Portal Dashboard / P2-04).
import {
  portalInvoiceStatus,
  portalMoney,
  portalOpenBalanceSub,
  portalPendingRequestsSub,
  portalVehicleSub,
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
    balanceDue: string
  }>
  openRequests: Array<{
    id: string
    type: string
    title: string
    meta: string
    statusLabel: string
  }>
}

const { data: dash, error } = useClientFetch<PortalDashboardPayload>('/api/portal/dashboard')
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:24px;">
      <p>Unable to load portal dashboard.</p>
    </div>

    <template v-else-if="dash">
      <div class="pagehead">
        <div>
          <h2>{{ dash.greeting }}</h2>
          <p>{{ dash.subtext }}</p>
        </div>
        <div class="actions">
          <NuxtLink to="/portal/vehicles" class="btn">+ Add vehicle</NuxtLink>
          <NuxtLink to="/portal/requests" class="btn">Request service</NuxtLink>
          <NuxtLink to="/portal/invoices" class="btn primary">View invoices</NuxtLink>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi">
          <div class="l">Open balance</div>
          <div class="v">{{ portalMoney(dash.kpis.openBalance) }}</div>
          <div class="s">{{ portalOpenBalanceSub(dash.kpis.openInvoiceCount) }}</div>
        </div>
        <div class="kpi">
          <div class="l">Vehicles</div>
          <div class="v">{{ dash.kpis.vehicleCount }}</div>
          <div class="s">{{ portalVehicleSub(dash.kpis.vehicleCount) }}</div>
        </div>
        <div class="kpi">
          <div class="l">Paid YTD</div>
          <div class="v">{{ portalMoney(dash.kpis.paidYtdTotal) }}</div>
          <div class="s">{{ dash.kpis.paidYtdLabel }}</div>
        </div>
        <div class="kpi">
          <div class="l">Pending requests</div>
          <div class="v">{{ dash.kpis.pendingRequestCount }}</div>
          <div class="s">{{ portalPendingRequestsSub(dash.kpis.pendingRequestCount) }}</div>
        </div>
      </div>

      <div class="cols">
        <div class="card">
          <div class="chead">
            <h3>Recent invoices</h3>
            <NuxtLink to="/portal/invoices" class="btn sm">View all →</NuxtLink>
          </div>
          <div v-if="!dash.recentInvoices.length" class="empty" style="padding:16px;color:#64748b;font-size:13px;">
            No invoices yet.
          </div>
          <div v-else class="tscroll">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th class="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="inv in dash.recentInvoices" :key="inv.id">
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
                  <td class="num">{{ portalMoney(inv.balanceDue) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="chead"><h3>Open requests</h3></div>
          <template v-if="dash.openRequests.length">
            <div
              v-for="req in dash.openRequests"
              :key="req.id"
              class="req-card"
              data-req-status="open"
            >
              <span class="req-type-pill">{{ req.type }}</span>
              <b>{{ req.title }}</b>
              <div class="meta">{{ req.meta }} · <span class="pill warn">{{ req.statusLabel }}</span></div>
            </div>
          </template>
          <div v-else class="req-card" style="color:#94a3b8;font-size:13px;">
            No open requests.
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
