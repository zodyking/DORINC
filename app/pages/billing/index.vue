<script setup lang="ts">
import type { BillingDashboardPayload } from '#shared/validators/billing-integrations'
import { resolveOpenRouterMonthlySpend } from '#shared/billing-openrouter-spend'
import type { BillingProviderKey } from '~/utils/billing-ui'
import {
  BILLING_PROVIDER_ACCOUNT_URLS,
  BILLING_PROVIDER_LABELS,
  billingAiMoney,
  billingDate,
  billingDateTime,
  billingDaysBadgeClass,
  billingMoney,
  billingProviderStatus,
  billingTokens,
  buildBillingChartGeometry,
  formatCloudflarePrivacy,
  formatVultrBandwidth,
  formatVultrCount,
  formatVultrDisk,
  formatVultrFeatureList,
  formatVultrInstanceStatus,
  formatVultrMonthlyCost,
  formatVultrRam,
  formatYesNo,
} from '~/utils/billing-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { formatPhoneDisplay, phoneDisplay } from '~/utils/phone-ui'

definePageMeta({ layout: 'staff', permission: 'billing.read.all' })

interface DashboardResponse {
  dashboard: BillingDashboardPayload
}

const PREVIEW_LIMIT = 5

const labels = BILLING_PROVIDER_LABELS

const { data, pending, error, refresh } = useClientFetch<DashboardResponse>('/api/billing/dashboard')

const dashboard = computed(() => data.value?.dashboard)

const openRouterUsedThisMonth = computed(() => {
  const row = dashboard.value?.openrouter
  if (!row) return null
  return resolveOpenRouterMonthlySpend(row.usageMonthly, row.internalMonthlyUsd)
})

const chart = computed(() => {
  const points = dashboard.value?.outlook?.points ?? []
  return buildBillingChartGeometry(points, 720, 200)
})

const detailTab = ref<BillingProviderKey>('vultr')
const expandedServers = ref<Record<string, boolean>>({})
const expandedDomains = ref<Record<string, boolean>>({})

watch(dashboard, (d) => {
  if (!d) return
  if (d.vultr.configured) detailTab.value = 'vultr'
  else if (d.cloudflare.configured) detailTab.value = 'cloudflare'
  else if (d.openrouter.configured) detailTab.value = 'openrouter'
  else if (d.quo.configured) detailTab.value = 'quo'
}, { immediate: true })

const breakdownTotal = computed(() => {
  const b = dashboard.value?.totals.breakdown
  if (!b) return 0
  return b.vultrUsd + b.cloudflareUsd + b.openrouterUsd + b.quoUsd
})

const yearlyBreakdownTotal = computed(() => {
  const b = dashboard.value?.totals.breakdownYearly
  if (!b) return 0
  return b.vultrUsd + b.cloudflareUsd + b.openrouterUsd + b.quoUsd
})

function breakdownShare(amount: number): number {
  const total = breakdownTotal.value
  if (total <= 0) return 0
  return Math.round((amount / total) * 100)
}

function yearlyBreakdownShare(amount: number): number {
  const total = yearlyBreakdownTotal.value
  if (total <= 0) return 0
  return Math.round((amount / total) * 100)
}

function openRouterAvailableCredit(d: BillingDashboardPayload['openrouter']): string {
  if (d.remainingCredits != null) return billingMoney(d.remainingCredits)
  if (d.limitRemaining != null) return billingMoney(d.limitRemaining)
  return '—'
}

function openProviderAccount(provider: BillingProviderKey) {
  window.open(BILLING_PROVIDER_ACCOUNT_URLS[provider], '_blank', 'noopener,noreferrer')
}

const refreshBusy = ref(false)

async function reload() {
  refreshBusy.value = true
  try {
    await refresh()
  }
  finally {
    refreshBusy.value = false
  }
}

function toggleServer(id: string) {
  expandedServers.value = {
    ...expandedServers.value,
    [id]: !expandedServers.value[id],
  }
}

function toggleDomain(name: string) {
  expandedDomains.value = {
    ...expandedDomains.value,
    [name]: !expandedDomains.value[name],
  }
}

const previewInvoices = computed(() => (dashboard.value?.vultr.invoices ?? []).slice(0, PREVIEW_LIMIT))
const monthUsage = computed(() => dashboard.value?.openrouter.usageHistory ?? [])
const previewDomains = computed(() => (dashboard.value?.cloudflare.domains ?? []).slice(0, PREVIEW_LIMIT))

const revealOpen = ref(false)
const revealProvider = ref<BillingProviderKey | null>(null)
const revealPassword = ref('')
const revealBusy = ref(false)
const revealError = ref('')
const revealed = ref<{ username: string | null, password: string | null } | null>(null)
const showRevealedPassword = ref(false)

function providerHasCredentials(provider: BillingProviderKey): boolean {
  const d = dashboard.value
  if (!d) return false
  if (provider === 'vultr') return d.vultr.hasPortalCredentials
  if (provider === 'cloudflare') return d.cloudflare.hasPortalCredentials
  if (provider === 'openrouter') return d.openrouter.hasPortalCredentials
  if (provider === 'quo') return d.quo.hasPortalCredentials
  return false
}

function openReveal(provider: BillingProviderKey) {
  if (!providerHasCredentials(provider)) return
  revealProvider.value = provider
  revealPassword.value = ''
  revealError.value = ''
  revealed.value = null
  showRevealedPassword.value = false
  revealOpen.value = true
}

function closeReveal() {
  revealOpen.value = false
  revealProvider.value = null
  revealPassword.value = ''
  revealError.value = ''
  revealed.value = null
  showRevealedPassword.value = false
}

async function submitReveal() {
  if (!revealProvider.value || revealBusy.value) return
  revealBusy.value = true
  revealError.value = ''
  try {
    const res = await $fetch<{ username: string | null, password: string | null }>(
      '/api/billing/credentials/reveal',
      {
        method: 'POST',
        body: {
          provider: revealProvider.value,
          password: revealPassword.value,
        },
      },
    )
    revealed.value = {
      username: res.username,
      password: res.password,
    }
    revealPassword.value = ''
  }
  catch (e: unknown) {
    revealError.value = syncFetchErrorMessage(e, 'Could not verify password')
  }
  finally {
    revealBusy.value = false
  }
}

async function copyText(value: string | null | undefined) {
  if (!value || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(value)
  }
  catch {
    // ignore clipboard failures
  }
}

function selectProvider(provider: BillingProviderKey) {
  detailTab.value = provider
}
</script>

<template>
  <section class="page active billing-page">
    <StaffPageHead subtitle="Infrastructure spend monitoring and outlook">
      <template #title>Billing</template>
      <template #actions>
        <button type="button" class="btn" :disabled="refreshBusy || pending" @click="reload">
          {{ refreshBusy || pending ? 'Refreshing…' : 'Refresh' }}
        </button>
      </template>
    </StaffPageHead>

    <div v-if="error" class="card">
      <div class="cbody">Could not load billing data.</div>
    </div>

    <div v-else-if="pending && !dashboard" class="card">
      <div class="cbody">Loading…</div>
    </div>

    <template v-else-if="dashboard">
      <div class="billing-stack">
        <!-- Compact metric strip -->
        <div class="kpis billing-kpis">
          <div class="kpi">
            <div class="l">Est. monthly</div>
            <div class="v">{{ billingMoney(dashboard.totals.estimatedMonthlyUsd, dashboard.totals.currency) }}</div>
            <div class="s">Likely spend this month</div>
          </div>
          <div class="kpi">
            <div class="l">Est. yearly</div>
            <div class="v">{{ billingMoney(dashboard.totals.estimatedYearlyUsd, dashboard.totals.currency) }}</div>
            <div class="s">Likely spend this year</div>
          </div>
          <div class="kpi">
            <div class="l">Hosting</div>
            <div class="v">{{ billingMoney(dashboard.totals.breakdown.vultrUsd) }}</div>
            <div class="s">{{ breakdownShare(dashboard.totals.breakdown.vultrUsd) }}% of this month</div>
          </div>
          <div class="kpi">
            <div class="l">Domains</div>
            <div class="v">{{ billingMoney(dashboard.totals.breakdown.cloudflareUsd) }}</div>
            <div class="s">{{ breakdownShare(dashboard.totals.breakdown.cloudflareUsd) }}% of this month</div>
          </div>
        </div>

        <!-- Full-width outlook -->
        <div class="card billing-outlook-card">
          <div class="chead">
            <div>
              <h3>Spend outlook</h3>
              <p class="billing-outlook-sub">12-month view — billed charges vs expected yearly spend</p>
            </div>
            <span class="pill muted billing-updated">Updated {{ new Date(dashboard.lastRefreshed).toLocaleString() }}</span>
          </div>
          <div class="cbody billing-outlook-body">
            <div class="billing-outlook-main">
              <svg
                class="billing-chart"
                :viewBox="`0 0 ${chart.width} ${chart.height}`"
                role="img"
                aria-label="Yearly billing spend chart"
              >
                <defs>
                  <linearGradient id="billingProjectedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#0f766e" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="#0f766e" stop-opacity="0.02" />
                  </linearGradient>
                </defs>
                <g v-for="tick in chart.yTicks" :key="`yt-${tick.value}`">
                  <line
                    class="billing-chart-grid"
                    :x1="chart.padX"
                    :x2="chart.width - chart.padX"
                    :y1="tick.y"
                    :y2="tick.y"
                  />
                  <text
                    class="billing-chart-ylabel"
                    :x="chart.padX - 8"
                    :y="tick.y + 3"
                    text-anchor="end"
                  >
                    {{ tick.label }}
                  </text>
                </g>
                <path v-if="chart.areaPath" :d="chart.areaPath" fill="url(#billingProjectedFill)" />
                <path v-if="chart.projectedPath" :d="chart.projectedPath" class="billing-chart-projected" fill="none" />
                <path v-if="chart.actualPath" :d="chart.actualPath" class="billing-chart-actual" fill="none" />
                <g v-for="point in chart.points" :key="point.label">
                  <circle
                    v-if="point.yProjected != null"
                    :cx="point.x"
                    :cy="point.yProjected"
                    r="3.5"
                    class="billing-chart-dot projected"
                  />
                  <circle
                    v-if="point.yActual != null"
                    :cx="point.x"
                    :cy="point.yActual"
                    r="3.5"
                    class="billing-chart-dot actual"
                  />
                  <text :x="point.x" :y="chart.height - 6" class="billing-chart-label" text-anchor="middle">
                    {{ point.label }}
                  </text>
                </g>
              </svg>
              <div class="billing-chart-legend">
                <span><i class="swatch actual" /> Billed</span>
                <span><i class="swatch projected" /> Expected</span>
              </div>
            </div>

            <aside class="billing-breakdown-aside" aria-label="Yearly breakdown">
              <h4 class="billing-sub">This year</h4>
              <ul class="billing-share-list">
                <li>
                  <div class="billing-share-row">
                    <span>{{ labels.vultr.category }}</span>
                    <strong>{{ billingMoney(dashboard.totals.breakdownYearly.vultrUsd) }}</strong>
                  </div>
                  <div class="billing-share-track" aria-hidden="true">
                    <span class="billing-share-fill hosting" :style="{ width: `${yearlyBreakdownShare(dashboard.totals.breakdownYearly.vultrUsd)}%` }" />
                  </div>
                </li>
                <li>
                  <div class="billing-share-row">
                    <span>{{ labels.cloudflare.category }}</span>
                    <strong>{{ billingMoney(dashboard.totals.breakdownYearly.cloudflareUsd) }}</strong>
                  </div>
                  <div class="billing-share-track" aria-hidden="true">
                    <span class="billing-share-fill domains" :style="{ width: `${yearlyBreakdownShare(dashboard.totals.breakdownYearly.cloudflareUsd)}%` }" />
                  </div>
                </li>
                <li>
                  <div class="billing-share-row">
                    <span>{{ labels.openrouter.category }}</span>
                    <strong>{{ billingAiMoney(dashboard.totals.breakdownYearly.openrouterUsd) }}</strong>
                  </div>
                  <div class="billing-share-track" aria-hidden="true">
                    <span class="billing-share-fill ai" :style="{ width: `${yearlyBreakdownShare(dashboard.totals.breakdownYearly.openrouterUsd)}%` }" />
                  </div>
                </li>
                <li>
                  <div class="billing-share-row">
                    <span>{{ labels.quo.category }}</span>
                    <strong>{{ billingMoney(dashboard.totals.breakdownYearly.quoUsd) }}</strong>
                  </div>
                  <div class="billing-share-track" aria-hidden="true">
                    <span class="billing-share-fill sms" :style="{ width: `${yearlyBreakdownShare(dashboard.totals.breakdownYearly.quoUsd)}%` }" />
                  </div>
                </li>
              </ul>
            </aside>
          </div>
        </div>

        <!-- Equal summary cards -->
        <div class="billing-provider-grid">
          <article
            class="card billing-summary-card"
            :class="{ active: detailTab === 'vultr' }"
            role="button"
            tabindex="0"
            @click="selectProvider('vultr')"
            @keyup.enter="selectProvider('vultr')"
          >
            <div class="chead">
              <div>
                <h3>{{ labels.vultr.name }}</h3>
                <span class="billing-cat">{{ labels.vultr.category }}</span>
              </div>
              <span class="pill" :class="billingProviderStatus(dashboard.vultr.configured, !!dashboard.vultr.error).class">
                {{ billingProviderStatus(dashboard.vultr.configured, !!dashboard.vultr.error).label }}
              </span>
            </div>
            <div class="cbody billing-summary-body">
              <p v-if="dashboard.vultr.error" class="billing-err">{{ dashboard.vultr.error }}</p>
              <template v-else-if="dashboard.vultr.configured">
                <dl class="billing-metric-grid">
                  <div>
                    <dt>Est. monthly</dt>
                    <dd>{{ formatVultrMonthlyCost(dashboard.vultr.planCostMonthly) }}</dd>
                  </div>
                  <div>
                    <dt>Balance</dt>
                    <dd>{{ billingMoney(dashboard.vultr.accountBalance) }}</dd>
                  </div>
                  <div>
                    <dt>Servers</dt>
                    <dd>{{ dashboard.vultr.monitoredInstances.length }}</dd>
                  </div>
                  <div>
                    <dt>Invoices</dt>
                    <dd>{{ dashboard.vultr.invoices.length }}</dd>
                  </div>
                </dl>
              </template>
              <p v-else class="billing-muted">Connect in Control Panel → Billing to monitor hosting spend.</p>
            </div>
            <footer class="billing-card-footer" @click.stop>
              <button
                v-if="dashboard.vultr.hasPortalCredentials"
                type="button"
                class="btn sm billing-cred-btn"
                @click="openReveal('vultr')"
              >
                <svg class="billing-btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Credentials
              </button>
              <span v-else class="billing-card-footer-spacer" aria-hidden="true" />
              <button type="button" class="btn sm billing-manage-btn" @click="openProviderAccount('vultr')">
                <svg class="billing-btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Manage account
              </button>
            </footer>
          </article>

          <article
            class="card billing-summary-card"
            :class="{ active: detailTab === 'cloudflare' }"
            role="button"
            tabindex="0"
            @click="selectProvider('cloudflare')"
            @keyup.enter="selectProvider('cloudflare')"
          >
            <div class="chead">
              <div>
                <h3>{{ labels.cloudflare.name }}</h3>
                <span class="billing-cat">{{ labels.cloudflare.category }}</span>
              </div>
              <span class="pill" :class="billingProviderStatus(dashboard.cloudflare.configured, !!dashboard.cloudflare.error).class">
                {{ billingProviderStatus(dashboard.cloudflare.configured, !!dashboard.cloudflare.error).label }}
              </span>
            </div>
            <div class="cbody billing-summary-body">
              <p v-if="dashboard.cloudflare.error" class="billing-err">{{ dashboard.cloudflare.error }}</p>
              <template v-else-if="dashboard.cloudflare.configured">
                <dl class="billing-metric-grid">
                  <div>
                    <dt>Domains</dt>
                    <dd>{{ dashboard.cloudflare.domains.length }}</dd>
                  </div>
                  <div>
                    <dt>Due ≤30d</dt>
                    <dd>{{ billingMoney(dashboard.totals.breakdown.cloudflareUsd) }}</dd>
                  </div>
                  <div>
                    <dt>Next expiry</dt>
                    <dd>{{ dashboard.cloudflare.domains[0] ? billingDate(dashboard.cloudflare.domains[0].renewalDate) : '—' }}</dd>
                  </div>
                  <div>
                    <dt>Auto-renew</dt>
                    <dd>
                      {{
                        dashboard.cloudflare.domains.length
                          ? `${dashboard.cloudflare.domains.filter(d => d.autoRenew).length}/${dashboard.cloudflare.domains.length}`
                          : '—'
                      }}
                    </dd>
                  </div>
                </dl>
              </template>
              <p v-else class="billing-muted">Connect Cloudflare Registrar in Control Panel → Billing.</p>
            </div>
            <footer class="billing-card-footer" @click.stop>
              <button
                v-if="dashboard.cloudflare.hasPortalCredentials"
                type="button"
                class="btn sm billing-cred-btn"
                @click="openReveal('cloudflare')"
              >
                <svg class="billing-btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Credentials
              </button>
              <span v-else class="billing-card-footer-spacer" aria-hidden="true" />
              <button type="button" class="btn sm billing-manage-btn" @click="openProviderAccount('cloudflare')">
                <svg class="billing-btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Manage account
              </button>
            </footer>
          </article>

          <article
            class="card billing-summary-card"
            :class="{ active: detailTab === 'openrouter' }"
            role="button"
            tabindex="0"
            @click="selectProvider('openrouter')"
            @keyup.enter="selectProvider('openrouter')"
          >
            <div class="chead">
              <div>
                <h3>{{ labels.openrouter.name }}</h3>
                <span class="billing-cat">{{ labels.openrouter.category }}</span>
              </div>
              <span class="pill" :class="billingProviderStatus(dashboard.openrouter.configured, !!dashboard.openrouter.error).class">
                {{ billingProviderStatus(dashboard.openrouter.configured, !!dashboard.openrouter.error).label }}
              </span>
            </div>
            <div class="cbody billing-summary-body">
              <p v-if="dashboard.openrouter.error" class="billing-err">{{ dashboard.openrouter.error }}</p>
              <template v-else-if="dashboard.openrouter.configured">
                <dl class="billing-metric-grid">
                  <div>
                    <dt>Available credit</dt>
                    <dd>{{ openRouterAvailableCredit(dashboard.openrouter) }}</dd>
                  </div>
                  <div>
                    <dt>Used this month</dt>
                    <dd>{{ billingAiMoney(openRouterUsedThisMonth) }}</dd>
                  </div>
                  <div>
                    <dt>Used today</dt>
                    <dd>{{ billingAiMoney(dashboard.openrouter.usageDaily) }}</dd>
                  </div>
                  <div>
                    <dt>Calls this month</dt>
                    <dd>{{ dashboard.openrouter.usageHistory.length }}</dd>
                  </div>
                </dl>
              </template>
              <p v-else class="billing-muted">Enable OpenRouter monitoring in Control Panel → Billing.</p>
            </div>
            <footer class="billing-card-footer" @click.stop>
              <button
                v-if="dashboard.openrouter.hasPortalCredentials"
                type="button"
                class="btn sm billing-cred-btn"
                @click="openReveal('openrouter')"
              >
                <svg class="billing-btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Credentials
              </button>
              <span v-else class="billing-card-footer-spacer" aria-hidden="true" />
              <button type="button" class="btn sm billing-manage-btn" @click="openProviderAccount('openrouter')">
                <svg class="billing-btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Manage account
              </button>
            </footer>
          </article>

          <article
            class="card billing-summary-card"
            :class="{ active: detailTab === 'quo' }"
            role="button"
            tabindex="0"
            @click="selectProvider('quo')"
            @keyup.enter="selectProvider('quo')"
          >
            <div class="chead">
              <div>
                <h3>{{ labels.quo.name }}</h3>
                <span class="billing-cat">{{ labels.quo.category }}</span>
              </div>
              <span class="pill" :class="billingProviderStatus(dashboard.quo.configured, !!dashboard.quo.error).class">
                {{ billingProviderStatus(dashboard.quo.configured, !!dashboard.quo.error).label }}
              </span>
            </div>
            <div class="cbody billing-summary-body">
              <p v-if="dashboard.quo.error" class="billing-err">{{ dashboard.quo.error }}</p>
              <template v-else-if="dashboard.quo.configured">
                <dl class="billing-metric-grid">
                  <div>
                    <dt>Status</dt>
                    <dd>{{ dashboard.quo.enabled ? 'Enabled' : 'Saved (off)' }}</dd>
                  </div>
                  <div>
                    <dt>This month</dt>
                    <dd>{{ billingMoney(dashboard.totals.breakdown.quoUsd) }}</dd>
                  </div>
                  <div>
                    <dt>Next payment</dt>
                    <dd>{{ billingDate(dashboard.quo.paymentDate) }}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>{{ billingMoney(dashboard.quo.paymentAmountUsd) }}</dd>
                  </div>
                </dl>
              </template>
              <p v-else class="billing-muted">Connect Quo in Control Panel → Quo SMS.</p>
            </div>
            <footer class="billing-card-footer" @click.stop>
              <div class="billing-card-footer-left">
                <button
                  v-if="dashboard.quo.hasPortalCredentials"
                  type="button"
                  class="btn sm billing-cred-btn"
                  @click="openReveal('quo')"
                >
                  <svg class="billing-btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Credentials
                </button>
                <NuxtLink to="/admin?tab=quo" class="btn sm">
                  Control Panel
                </NuxtLink>
              </div>
              <button type="button" class="btn sm billing-manage-btn" @click="openProviderAccount('quo')">
                <svg class="billing-btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Manage account
              </button>
            </footer>
          </article>
        </div>

        <!-- Tabbed detail panel -->
        <div class="card billing-detail-card">
          <div class="chead billing-detail-tabs" role="tablist" aria-label="Provider details">
            <button
              type="button"
              class="billing-tab"
              role="tab"
              :aria-selected="detailTab === 'vultr'"
              :class="{ active: detailTab === 'vultr' }"
              @click="detailTab = 'vultr'"
            >
              {{ labels.vultr.name }}
            </button>
            <button
              type="button"
              class="billing-tab"
              role="tab"
              :aria-selected="detailTab === 'cloudflare'"
              :class="{ active: detailTab === 'cloudflare' }"
              @click="detailTab = 'cloudflare'"
            >
              {{ labels.cloudflare.name }}
            </button>
            <button
              type="button"
              class="billing-tab"
              role="tab"
              :aria-selected="detailTab === 'openrouter'"
              :class="{ active: detailTab === 'openrouter' }"
              @click="detailTab = 'openrouter'"
            >
              {{ labels.openrouter.name }}
            </button>
            <button
              type="button"
              class="billing-tab"
              role="tab"
              :aria-selected="detailTab === 'quo'"
              :class="{ active: detailTab === 'quo' }"
              @click="detailTab = 'quo'"
            >
              {{ labels.quo.name }}
            </button>
          </div>

          <div class="cbody billing-detail-body">
            <template v-if="detailTab === 'vultr'">
              <p v-if="dashboard.vultr.error" class="billing-err">{{ dashboard.vultr.error }}</p>
              <template v-else-if="dashboard.vultr.configured">
                <div v-if="dashboard.vultr.monitoredInstances.length" class="billing-section">
                  <div class="billing-section-head">
                    <h4 class="billing-sub">Monitored servers</h4>
                    <span class="billing-count">{{ dashboard.vultr.monitoredInstances.length }}</span>
                  </div>
                  <ul class="billing-compact-list">
                    <li v-for="inst in dashboard.vultr.monitoredInstances" :key="inst.id">
                      <button type="button" class="billing-compact-row" @click="toggleServer(inst.id)">
                        <div>
                          <strong>{{ inst.label }}</strong>
                          <span class="billing-compact-meta">
                            {{ inst.plan || '—' }} · {{ formatVultrMonthlyCost(inst.monthlyPlanCost) }} · {{ formatVultrInstanceStatus(inst.status) }}
                          </span>
                        </div>
                        <span class="billing-expand">{{ expandedServers[inst.id] ? 'Hide' : 'Details' }}</span>
                      </button>
                      <div v-if="expandedServers[inst.id]" class="billing-expand-panel">
                        <dl class="billing-server__details">
                          <div>
                            <dt>OS</dt>
                            <dd>{{ inst.os || '—' }}</dd>
                          </div>
                          <div>
                            <dt>Compute</dt>
                            <dd>{{ formatVultrCount(inst.vcpuCount, 'vCPU') }} · {{ formatVultrRam(inst.ramMb) }} · {{ formatVultrDisk(inst.diskGb) }}</dd>
                          </div>
                          <div>
                            <dt>Bandwidth</dt>
                            <dd>{{ formatVultrBandwidth(inst.allowedBandwidthGb) }}</dd>
                          </div>
                          <div>
                            <dt>Region</dt>
                            <dd>{{ inst.region || '—' }}</dd>
                          </div>
                          <div v-if="inst.mainIp">
                            <dt>IPv4</dt>
                            <dd class="mono">{{ inst.mainIp }}</dd>
                          </div>
                          <div v-if="inst.powerStatus">
                            <dt>Power</dt>
                            <dd>{{ formatVultrInstanceStatus(inst.powerStatus) }}</dd>
                          </div>
                          <div v-if="inst.serverStatus">
                            <dt>Health</dt>
                            <dd>{{ formatVultrInstanceStatus(inst.serverStatus) }}</dd>
                          </div>
                          <div v-if="inst.dateCreated">
                            <dt>Created</dt>
                            <dd>{{ billingDate(inst.dateCreated) }}</dd>
                          </div>
                          <div v-if="inst.features.length">
                            <dt>Features</dt>
                            <dd>{{ formatVultrFeatureList(inst.features) }}</dd>
                          </div>
                        </dl>
                      </div>
                    </li>
                  </ul>
                </div>
                <div v-else class="billing-muted">No monitored servers selected.</div>

                <div v-if="previewInvoices.length" class="billing-section">
                  <div class="billing-section-head">
                    <h4 class="billing-sub">Recent invoices</h4>
                    <span class="billing-count">Showing {{ previewInvoices.length }} of {{ dashboard.vultr.invoices.length }}</span>
                  </div>
                  <div class="tscroll">
                    <table class="tbl compact">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th class="num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in previewInvoices" :key="row.id">
                          <td>{{ billingDate(row.date) }}</td>
                          <td>{{ row.description }}</td>
                          <td class="num">{{ billingMoney(row.amount) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </template>
              <p v-else class="billing-muted">Set up Vultr in Control Panel → Billing.</p>
            </template>

            <template v-else-if="detailTab === 'cloudflare'">
              <p v-if="dashboard.cloudflare.error" class="billing-err">{{ dashboard.cloudflare.error }}</p>
              <template v-else-if="dashboard.cloudflare.configured && dashboard.cloudflare.domains.length">
                <div class="billing-section">
                  <div class="billing-section-head">
                    <h4 class="billing-sub">Registrar domains</h4>
                    <span class="billing-count">Showing {{ previewDomains.length }} of {{ dashboard.cloudflare.domains.length }}</span>
                  </div>
                  <ul class="billing-compact-list">
                    <li v-for="domain in previewDomains" :key="domain.name">
                      <button type="button" class="billing-compact-row" @click="toggleDomain(domain.name)">
                        <div>
                          <strong>{{ domain.name }}</strong>
                          <span class="billing-compact-meta">
                            Expires {{ billingDate(domain.renewalDate) }}
                            ·
                            <span class="pill sm" :class="billingDaysBadgeClass(domain.daysUntilRenewal)">{{ domain.daysUntilRenewal }}d</span>
                            ·
                            {{ domain.renewalCost > 0 ? billingMoney(domain.renewalCost, domain.currency) : '—' }}
                          </span>
                        </div>
                        <span class="billing-expand">{{ expandedDomains[domain.name] ? 'Hide' : 'Details' }}</span>
                      </button>
                      <div v-if="expandedDomains[domain.name]" class="billing-expand-panel">
                        <dl class="billing-server__details">
                          <div>
                            <dt>Registration date</dt>
                            <dd>{{ billingDate(domain.registeredAt) }}</dd>
                          </div>
                          <div>
                            <dt>Auto renew</dt>
                            <dd>{{ formatYesNo(domain.autoRenew) }}</dd>
                          </div>
                          <div>
                            <dt>Registrar lock</dt>
                            <dd>{{ formatYesNo(domain.locked) }}</dd>
                          </div>
                          <div>
                            <dt>Domain status</dt>
                            <dd>{{ formatVultrInstanceStatus(domain.status || '') }}</dd>
                          </div>
                          <div>
                            <dt>Privacy status</dt>
                            <dd>{{ formatCloudflarePrivacy(domain.privacyMode) }}</dd>
                          </div>
                          <div>
                            <dt>Renewal cost</dt>
                            <dd>{{ domain.renewalCost > 0 ? billingMoney(domain.renewalCost, domain.currency) : '—' }}</dd>
                          </div>
                        </dl>
                      </div>
                    </li>
                  </ul>
                </div>
              </template>
              <p v-else-if="dashboard.cloudflare.configured" class="billing-muted">
                No registrar domains found for this Cloudflare account.
              </p>
              <p v-else class="billing-muted">Connect Cloudflare in Control Panel → Billing.</p>
            </template>

            <template v-else-if="detailTab === 'openrouter'">
              <p v-if="dashboard.openrouter.error" class="billing-err">{{ dashboard.openrouter.error }}</p>
              <template v-else-if="dashboard.openrouter.configured">
                <p v-if="dashboard.openrouter.creditsNote" class="billing-note">{{ dashboard.openrouter.creditsNote }}</p>
                <div v-if="monthUsage.length" class="billing-section">
                  <div class="billing-section-head">
                    <h4 class="billing-sub">API usage this month</h4>
                    <span class="billing-count">{{ monthUsage.length }} call{{ monthUsage.length === 1 ? '' : 's' }}</span>
                  </div>
                  <div class="billing-usage-scroll">
                    <table class="tbl compact">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th class="num">Tokens</th>
                          <th class="num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in monthUsage" :key="row.id">
                          <td>{{ billingDateTime(row.date) }}</td>
                          <td>{{ row.description }}</td>
                          <td class="num">{{ billingTokens(row.tokens) }}</td>
                          <td class="num">{{ billingAiMoney(row.amount) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <p v-else class="billing-muted">No API usage recorded this month.</p>
              </template>
              <p v-else class="billing-muted">Enable OpenRouter in Control Panel → Billing.</p>
            </template>

            <template v-else-if="detailTab === 'quo'">
              <template v-if="dashboard.quo.configured">
                <p class="billing-muted" style="margin-top:0;">
                  {{ dashboard.quo.creditsNote }}
                </p>
                <dl class="billing-metric-grid" style="margin-bottom:16px;">
                  <div>
                    <dt>Enabled in app</dt>
                    <dd>{{ dashboard.quo.enabled ? 'Yes' : 'No' }}</dd>
                  </div>
                  <div>
                    <dt>From number</dt>
                    <dd>{{ phoneDisplay(dashboard.quo.fromNumber) }}</dd>
                  </div>
                  <div>
                    <dt>Workspace numbers</dt>
                    <dd>{{ dashboard.quo.phoneCount }}</dd>
                  </div>
                  <div>
                    <dt>Next payment</dt>
                    <dd>
                      {{ billingDate(dashboard.quo.paymentDate) }}
                      <span
                        v-if="dashboard.quo.daysUntilPayment != null"
                        class="pill sm"
                        :class="billingDaysBadgeClass(dashboard.quo.daysUntilPayment)"
                        style="margin-left:6px;"
                      >
                        {{ dashboard.quo.daysUntilPayment < 0
                          ? `${Math.abs(dashboard.quo.daysUntilPayment)}d overdue`
                          : dashboard.quo.daysUntilPayment === 0
                            ? 'Due today'
                            : `${dashboard.quo.daysUntilPayment}d` }}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Payment amount</dt>
                    <dd>{{ billingMoney(dashboard.quo.paymentAmountUsd) }}</dd>
                  </div>
                  <div>
                    <dt>In monthly total</dt>
                    <dd>{{ billingMoney(dashboard.totals.breakdown.quoUsd) }}</dd>
                  </div>
                  <div>
                    <dt>In yearly total</dt>
                    <dd>{{ billingMoney(dashboard.totals.breakdownYearly.quoUsd) }}</dd>
                  </div>
                </dl>
                <div v-if="dashboard.quo.phoneNumbers.length" class="billing-table-wrap">
                  <table class="billing-table">
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Label</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in dashboard.quo.phoneNumbers" :key="row.id || row.number">
                        <td>{{ row.formattedNumber || formatPhoneDisplay(row.number) || row.number }}</td>
                        <td>{{ row.name || '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="billing-muted">No phone numbers returned for this Quo workspace yet.</p>
              </template>
              <p v-else class="billing-muted">Connect Quo in Control Panel → Quo SMS.</p>
            </template>
          </div>
        </div>
      </div>

      <div v-if="revealOpen" class="billing-modal-backdrop" @click.self="closeReveal">
        <div class="card billing-modal" role="dialog" aria-modal="true" aria-labelledby="billing-cred-title">
          <div class="chead billing-modal-head">
            <div class="billing-modal-title">
              <svg class="billing-btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <h3 id="billing-cred-title">
                {{ revealProvider ? `${labels[revealProvider].name} login` : 'Credentials' }}
              </h3>
            </div>
            <button type="button" class="btn sm" @click="closeReveal">Close</button>
          </div>
          <div class="cbody billing-modal-body">
            <template v-if="!revealed">
              <p class="billing-muted billing-modal-lead">
                Confirm with your Dorinc account password to view the saved portal login.
              </p>
              <label class="fld">
                Account password
                <input
                  v-model="revealPassword"
                  type="password"
                  autocomplete="current-password"
                  @keyup.enter="submitReveal"
                >
              </label>
              <p v-if="revealError" class="billing-err">{{ revealError }}</p>
              <div class="billing-modal-actions">
                <button type="button" class="btn" :disabled="revealBusy" @click="closeReveal">Cancel</button>
                <button
                  type="button"
                  class="btn primary"
                  :disabled="revealBusy || !revealPassword"
                  @click="submitReveal"
                >
                  {{ revealBusy ? 'Verifying…' : 'Show credentials' }}
                </button>
              </div>
            </template>
            <template v-else>
              <div class="billing-cred-list">
                <div class="billing-cred-row">
                  <span class="billing-cred-label">Username</span>
                  <div class="billing-cred-value">
                    <span class="billing-cred-text">{{ revealed.username || '—' }}</span>
                    <button
                      v-if="revealed.username"
                      type="button"
                      class="btn sm"
                      @click="copyText(revealed.username)"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div class="billing-cred-row">
                  <span class="billing-cred-label">Password</span>
                  <div class="billing-cred-value">
                    <span class="billing-cred-text mono">{{ showRevealedPassword ? (revealed.password || '—') : (revealed.password ? '••••••••••••' : '—') }}</span>
                    <button
                      v-if="revealed.password"
                      type="button"
                      class="btn sm"
                      @click="showRevealedPassword = !showRevealedPassword"
                    >
                      {{ showRevealedPassword ? 'Hide' : 'Show' }}
                    </button>
                    <button
                      v-if="revealed.password"
                      type="button"
                      class="btn sm"
                      @click="copyText(revealed.password)"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
              <div class="billing-modal-actions">
                <button type="button" class="btn" @click="closeReveal">Done</button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
section.page.active.billing-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.billing-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.billing-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 0;
}

/* Keep a 2×2 card grid on tablet/phone — never stack to a single column. */
@media (max-width: 960px) {
  .billing-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .billing-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .billing-kpis .kpi {
    padding: 14px 12px;
  }

  .billing-kpis .kpi .v {
    font-size: 18px;
  }

  .billing-kpis .kpi .s {
    font-size: 11px;
    line-height: 1.35;
  }
}

.billing-outlook-card {
  margin: 0;
}

.billing-outlook-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #64748b;
}

.billing-outlook-body {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(220px, 0.8fr);
  gap: 24px;
  align-items: start;
}

@media (max-width: 900px) {
  .billing-outlook-body {
    grid-template-columns: 1fr;
  }
}

.billing-outlook-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.billing-chart {
  width: 100%;
  height: auto;
  min-height: 180px;
  background:
    linear-gradient(180deg, rgba(15, 118, 110, 0.04), transparent 48%),
    #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.billing-chart-grid {
  stroke: #e2e8f0;
  stroke-width: 1;
}

.billing-chart-actual {
  stroke: #0f172a;
  stroke-width: 2.5;
}

.billing-chart-projected {
  stroke: #0f766e;
  stroke-width: 2.5;
  stroke-dasharray: 6 4;
}

.billing-chart-dot.actual {
  fill: #0f172a;
}

.billing-chart-dot.projected {
  fill: #0f766e;
}

.billing-chart-label {
  fill: #64748b;
  font-size: 10px;
}

.billing-chart-ylabel {
  fill: #94a3b8;
  font-size: 10px;
}

.billing-chart-legend {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #475569;
}

.billing-chart-legend .swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  border-radius: 999px;
  vertical-align: -2px;
}

.billing-chart-legend .swatch.actual {
  background: #0f172a;
}

.billing-chart-legend .swatch.projected {
  background: #0f766e;
}

.billing-breakdown-aside {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0;
}

.billing-share-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.billing-share-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: #475569;
  margin-bottom: 6px;
}

.billing-share-row strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.billing-share-track {
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.billing-share-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  min-width: 0;
}

.billing-share-fill.hosting {
  background: #0f766e;
}

.billing-share-fill.domains {
  background: #0369a1;
}

.billing-share-fill.ai {
  background: #4338ca;
}

.billing-share-fill.sms {
  background: #b45309;
}

.billing-updated {
  font-size: 11px;
  font-weight: 600;
}

.billing-provider-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}

@media (max-width: 1280px) {
  .billing-provider-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .billing-provider-grid {
    grid-template-columns: 1fr;
  }
}

.billing-summary-card {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  min-width: 0;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.billing-summary-card :deep(.chead) {
  padding: 14px 14px 10px;
}

.billing-summary-card :deep(.chead h3) {
  font-size: 16px;
}

.billing-summary-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 12px;
  flex: 1;
}

.billing-summary-card .billing-metric-grid {
  gap: 10px 12px;
}

.billing-summary-card .billing-metric-grid dt {
  font-size: 10px;
}

.billing-summary-card .billing-metric-grid dd {
  font-size: 14px;
}

.billing-summary-card:hover,
.billing-summary-card:focus-visible {
  border-color: #99f6e4;
  outline: none;
}

.billing-summary-card.active {
  border-color: #0f766e;
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.18);
}

.billing-metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}

.billing-metric-grid dt {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 3px;
}

.billing-metric-grid dd {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.billing-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px 14px;
  margin-top: auto;
  border-top: 1px solid #e2e8f0;
}

.billing-card-footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.billing-card-footer-spacer {
  flex: 1;
}

.billing-cred-btn,
.billing-manage-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.billing-manage-btn {
  margin-left: auto;
}

.billing-btn-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.billing-usage-scroll {
  max-height: 420px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.billing-usage-scroll::-webkit-scrollbar {
  display: none;
}

.billing-cat {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #0f766e;
}

.billing-detail-card {
  margin: 0;
}

.billing-detail-tabs {
  gap: 8px;
  justify-content: flex-start;
}

.billing-tab {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}

.billing-tab:hover {
  background: #f8fafc;
  color: #0f172a;
}

.billing-tab.active {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #0f766e;
}

.billing-detail-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 18px;
  padding-bottom: 18px;
}

.billing-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.billing-section + .billing-section {
  padding-top: 18px;
  border-top: 1px solid #e2e8f0;
}

.billing-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.billing-sub {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.billing-count {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}

.billing-compact-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.billing-compact-list > li {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  overflow: hidden;
}

.billing-compact-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.billing-compact-row strong {
  display: block;
  font-size: 13.5px;
  color: #0f172a;
}

.billing-compact-meta {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: #64748b;
}

.billing-expand {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #0f766e;
}

.billing-expand-panel {
  padding: 0 14px 14px;
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
}

.billing-server__details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  margin: 0;
}

@media (max-width: 520px) {
  .billing-server__details {
    grid-template-columns: 1fr;
  }
}

.billing-server__details dt {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 3px;
}

.billing-server__details dd {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  word-break: break-word;
}

.billing-server__details dd.mono,
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
}

.billing-note {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}

.billing-muted {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
}

.billing-err {
  margin: 0;
  font-size: 13px;
  color: #dc2626;
}

.pill.sm {
  font-size: 11px;
  padding: 2px 8px;
}

.pill.muted {
  background: #f1f5f9;
  color: #64748b;
}

.pill.amber {
  background: #fef3c7;
  color: #b45309;
}

.tbl.compact th,
.tbl.compact td {
  font-size: 12.5px;
  padding: 10px 12px;
}

.billing-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
}

.billing-modal {
  width: min(400px, 100%);
  margin: 0;
  border-radius: 12px;
  overflow: hidden;
}

.billing-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.billing-modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.billing-modal-title h3 {
  margin: 0;
  font-size: 16px;
}

.billing-modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.billing-modal-lead {
  margin: 0;
  line-height: 1.45;
}

.billing-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.billing-cred-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.billing-cred-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.billing-cred-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.billing-cred-value {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.billing-cred-text {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}
</style>
