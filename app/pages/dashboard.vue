<script setup lang="ts">
// Staff dashboard — KPI cards, recent invoices, activity feed (mockup: PAGE: DASHBOARD / P1-37).
import {
  dashboardActivityWhen,
  dashboardAvgDaysDisplay,
  dashboardInvoiceStatusPill,
  dashboardKpiDeltaClass,
  dashboardMechanicFleetSub,
  dashboardMoney,
  dashboardOutstandingSub,
  dashboardOverdueSub,
} from '~/utils/dashboard-ui'
import { auditorAccessBanner, auditorInvoiceSub } from '~/utils/auditor-ui'

definePageMeta({ layout: 'staff' })

interface DashboardCta { label: string, href: string }

interface DashboardPayload {
  view: 'billing' | 'mechanic' | 'auditor'
  greeting: string
  subtext: string
  attentionCount: number
  primaryCta: DashboardCta
  secondaryCta: DashboardCta
  billing?: {
    kpis: {
      outstandingTotal: string
      outstandingCount: number
      paidThisMonthTotal: string
      paidThisMonthDelta: string | null
      overdueTotal: string
      overdueCount: number
      avgDaysToPay: number | null
    }
    needsAttention: Array<{
      id: string
      invoiceNumberFormatted: string
      customerName: string
      status: string
      total: string
      sublabel: string
    }>
    recentActivity: Array<{
      id: string
      title: string
      detail: string
      hot: boolean
      createdAt: string
    }>
    reviewQueue: {
      serviceLogs: number
      portalRequests: number
      deletionRequests: number
      aiExtractions: number
      managerApprovals: number
      total: number
    }
  }
  mechanic?: {
    kpis: {
      logsThisMonth: number
      awaitingReview: number
      fleetVehicles: number
      customerCount: number
      lastUploadLabel: string | null
    }
    recentLogs: Array<{
      id: string
      logNumberFormatted: string
      title: string
      detail: string
      hot: boolean
    }>
  }
  auditor?: {
    kpis: {
      invoiceCount: number
      sentCount: number
      paidCount: number
      outstandingTotal: string
      paidThisMonthTotal: string
    }
    recentInvoices: Array<{
      id: string
      invoiceNumberFormatted: string
      customerName: string
      status: string
      total: string
      sublabel: string
    }>
    recentAudit: Array<{
      id: string
      title: string
      detail: string
      hot: boolean
      createdAt: string
    }>
  }
}

const auth = useAuthStore()
const canCreateInvoice = computed(() => auth.can('invoices.create.all'))
const canCreateLog = computed(() => auth.can('service_logs.upload.own'))

const { data: dash, error } = await useFetch<DashboardPayload>('/api/dashboard')

const showBilling = computed(() => dash.value?.view === 'billing' && dash.value.billing)
const showMechanic = computed(() => dash.value?.view === 'mechanic' && dash.value.mechanic)
const showAuditor = computed(() => dash.value?.view === 'auditor' && dash.value.auditor)
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:24px;">
      <p>Unable to load dashboard.</p>
    </div>

    <template v-else-if="dash">
      <div class="pagehead">
        <div>
          <h2>{{ dash.greeting }}</h2>
          <p>{{ dash.subtext }}</p>
        </div>
        <div class="actions">
          <NuxtLink :to="dash.secondaryCta.href" class="btn">{{ dash.secondaryCta.label }}</NuxtLink>
          <NuxtLink
            v-if="(dash.view === 'billing' && canCreateInvoice) || (dash.view === 'mechanic' && canCreateLog)"
            :to="dash.primaryCta.href"
            class="btn primary"
            @click="armWizardSpeechFromCreateClick"
          >
            {{ dash.primaryCta.label }}
          </NuxtLink>
        </div>
      </div>

      <div v-if="showBilling && dash.billing" id="dash-billing">
        <div class="kpis">
          <div class="kpi">
            <div class="t">Outstanding</div>
            <div class="v">{{ dashboardMoney(dash.billing.kpis.outstandingTotal) }}</div>
            <div class="d flat">{{ dashboardOutstandingSub(dash.billing.kpis.outstandingCount) }}</div>
          </div>
          <div class="kpi">
            <div class="t">Paid this month</div>
            <div class="v">{{ dashboardMoney(dash.billing.kpis.paidThisMonthTotal) }}</div>
            <div class="d" :class="dashboardKpiDeltaClass(dash.billing.kpis.paidThisMonthDelta)">
              {{ dash.billing.kpis.paidThisMonthDelta ?? '—' }}
            </div>
          </div>
          <div class="kpi">
            <div class="t">Overdue</div>
            <div class="v">{{ dashboardMoney(dash.billing.kpis.overdueTotal) }}</div>
            <div class="d down">{{ dashboardOverdueSub(dash.billing.kpis.overdueCount) }}</div>
          </div>
          <div class="kpi">
            <div class="t">Avg. days to pay</div>
            <div class="v">{{ dashboardAvgDaysDisplay(dash.billing.kpis.avgDaysToPay) }}</div>
            <div class="d flat">—</div>
          </div>
        </div>

        <div class="cols">
          <div class="card">
            <div class="chead">
              <h3>Needs attention</h3>
              <div class="right">
                <NuxtLink to="/invoices" class="btn ghost sm">All invoices →</NuxtLink>
              </div>
            </div>
            <div class="tscroll">
              <table v-if="dash.billing.needsAttention.length" class="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th class="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in dash.billing.needsAttention"
                    :key="row.id"
                    class="click"
                    @click="navigateTo(row.status === 'draft' ? `/invoices/${row.id}/edit` : `/invoices/${row.id}`)"
                  >
                    <td>
                      <span class="lead">{{ row.invoiceNumberFormatted }}</span>
                      <span v-if="row.sublabel" class="sub">{{ row.sublabel }}</span>
                    </td>
                    <td>{{ row.customerName }}</td>
                    <td>
                      <span :class="dashboardInvoiceStatusPill(row.status).cls">
                        {{ dashboardInvoiceStatusPill(row.status).label }}
                      </span>
                    </td>
                    <td class="num">{{ dashboardMoney(row.total) }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="empty">Nothing needs attention right now.</div>
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="chead"><h3>Recent activity</h3></div>
              <div v-if="dash.billing.recentActivity.length" class="timeline">
                <div
                  v-for="item in dash.billing.recentActivity"
                  :key="item.id"
                  class="tl"
                  :class="{ hot: item.hot }"
                >
                  <b>{{ item.title }}</b>
                  <span>{{ item.detail || dashboardActivityWhen(item.createdAt) }}</span>
                </div>
              </div>
              <div v-else class="cbody" style="color:#64748b; font-size:13px;">No recent activity yet.</div>
            </div>

            <div class="card">
              <div class="chead">
                <h3>Review queue</h3>
                <div class="right">
                  <span v-if="dash.billing.reviewQueue.total" class="pill warn">
                    {{ dash.billing.reviewQueue.total }} pending
                  </span>
                </div>
              </div>
              <dl class="kv">
                <dt>Service logs</dt>
                <dd>{{ dash.billing.reviewQueue.serviceLogs }} to review</dd>
                <dt>Portal requests</dt>
                <dd>
                  <NuxtLink to="/portal-requests">{{ dash.billing.reviewQueue.portalRequests }} pending</NuxtLink>
                </dd>
                <dt>Deletion requests</dt>
                <dd>
                  <NuxtLink to="/deletion-requests">{{ dash.billing.reviewQueue.deletionRequests }} pending</NuxtLink>
                </dd>
                <dt>AI extractions</dt>
                <dd>{{ dash.billing.reviewQueue.aiExtractions }} to approve</dd>
                <dt>Manager approvals</dt>
                <dd>
                  <NuxtLink to="/invoices?status=pending_manager_approval">
                    {{ dash.billing.reviewQueue.managerApprovals }} pending
                  </NuxtLink>
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showMechanic && dash.mechanic" id="dash-mechanic">
        <div class="kpis">
          <div class="kpi">
            <div class="t">Logs this month</div>
            <div class="v">{{ dash.mechanic.kpis.logsThisMonth }}</div>
            <div class="d flat">—</div>
          </div>
          <div class="kpi">
            <div class="t">Awaiting review</div>
            <div class="v">{{ dash.mechanic.kpis.awaitingReview }}</div>
            <div class="d flat">{{ dash.mechanic.kpis.awaitingReview ? 'In review queue' : '—' }}</div>
          </div>
          <div class="kpi">
            <div class="t">Fleet vehicles</div>
            <div class="v">{{ dash.mechanic.kpis.fleetVehicles }}</div>
            <div class="d flat">
              {{ dashboardMechanicFleetSub(dash.mechanic.kpis.fleetVehicles, dash.mechanic.kpis.customerCount) }}
            </div>
          </div>
          <div class="kpi">
            <div class="t">Last upload</div>
            <div class="v">{{ dash.mechanic.kpis.lastUploadLabel ? 'Recent' : '—' }}</div>
            <div class="d flat">{{ dash.mechanic.kpis.lastUploadLabel ?? '—' }}</div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="chead">
              <h3>My recent logs</h3>
              <div class="right">
                <NuxtLink to="/service-logs" class="btn ghost sm">View all →</NuxtLink>
              </div>
            </div>
            <div v-if="dash.mechanic.recentLogs.length" class="timeline">
              <div
                v-for="log in dash.mechanic.recentLogs"
                :key="log.id"
                class="tl"
                :class="{ hot: log.hot }"
                style="cursor:pointer;"
                @click="navigateTo(`/service-logs/${log.id}`)"
              >
                <b>{{ log.title }}</b>
                <span>{{ log.detail }}</span>
              </div>
            </div>
            <div v-else class="empty">No service logs uploaded yet.</div>
          </div>

          <div class="card">
            <div class="chead"><h3>Quick tips</h3></div>
            <div class="cbody" style="font-size:13px; color:#475569; line-height:1.6;">
              Photograph handwritten worksheets and odometer readings. Logs queue for accountant review —
              you don't create invoices from here.
            </div>
          </div>
        </div>
      </div>

      <div v-if="showAuditor && dash.auditor" id="dash-auditor">
        <div class="card" style="margin-bottom:16px; padding:14px 18px; background:#f8fafc;">
          <p style="margin:0; font-size:13px; color:#475569;">{{ auditorAccessBanner() }}</p>
        </div>
        <div class="kpis">
          <div class="kpi">
            <div class="t">Invoices on file</div>
            <div class="v">{{ dash.auditor.kpis.invoiceCount }}</div>
            <div class="d flat">{{ dash.auditor.kpis.sentCount }} sent · {{ dash.auditor.kpis.paidCount }} paid</div>
          </div>
          <div class="kpi">
            <div class="t">Outstanding</div>
            <div class="v">{{ dashboardMoney(dash.auditor.kpis.outstandingTotal) }}</div>
            <div class="d flat">Open balances</div>
          </div>
          <div class="kpi">
            <div class="t">Paid this month</div>
            <div class="v">{{ dashboardMoney(dash.auditor.kpis.paidThisMonthTotal) }}</div>
            <div class="d flat">Settled revenue</div>
          </div>
        </div>

        <div class="cols">
          <div class="card">
            <div class="chead">
              <h3>Recent invoices</h3>
              <div class="right">
                <NuxtLink to="/invoices" class="btn ghost sm">All invoices →</NuxtLink>
              </div>
            </div>
            <div class="tscroll">
              <table v-if="dash.auditor.recentInvoices.length" class="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th class="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in dash.auditor.recentInvoices"
                    :key="row.id"
                    class="click"
                    @click="navigateTo(`/invoices/${row.id}`)"
                  >
                    <td>
                      <span class="lead">{{ row.invoiceNumberFormatted }}</span>
                      <span class="sub">{{ row.sublabel }}</span>
                    </td>
                    <td>{{ row.customerName }}</td>
                    <td>{{ auditorInvoiceSub(row.status) }}</td>
                    <td class="num">{{ dashboardMoney(row.total) }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="empty">No finalized invoices yet.</div>
            </div>
          </div>

          <div class="card">
            <div class="chead">
              <h3>Recent audit events</h3>
              <div class="right">
                <NuxtLink to="/system-logs" class="btn ghost sm">System logs →</NuxtLink>
              </div>
            </div>
            <div v-if="dash.auditor.recentAudit.length" class="timeline">
              <div
                v-for="item in dash.auditor.recentAudit"
                :key="item.id"
                class="tl"
                :class="{ hot: item.hot }"
              >
                <b>{{ item.title }}</b>
                <span>{{ item.detail || dashboardActivityWhen(item.createdAt) }}</span>
              </div>
            </div>
            <div v-else class="cbody" style="color:#64748b; font-size:13px;">No audit events yet.</div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
