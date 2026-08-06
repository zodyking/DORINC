<script setup lang="ts">
import type { BillingDashboardPayload } from '#shared/validators/billing-integrations'
import type { BillingProviderKey } from '~/utils/billing-ui'
import {
  BILLING_PROVIDER_ACCOUNT_URLS,
  BILLING_PROVIDER_LABELS,
  billingDate,
  billingDateTime,
  billingDaysBadgeClass,
  billingMoney,
  billingProviderManageLabel,
  billingProviderStatus,
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

definePageMeta({ layout: 'staff', permission: 'billing.read.all' })

interface DashboardResponse {
  dashboard: BillingDashboardPayload
}

const labels = BILLING_PROVIDER_LABELS

const { data, pending, error, refresh } = useClientFetch<DashboardResponse>('/api/billing/dashboard')

const dashboard = computed(() => data.value?.dashboard)

const chart = computed(() => {
  const points = dashboard.value?.outlook?.points ?? []
  return buildBillingChartGeometry(points)
})

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
  return d.openrouter.hasPortalCredentials
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
        <div class="billing-summary">
          <div class="kpis billing-kpis">
            <div class="kpi">
              <div class="t">Est. monthly</div>
              <div class="v">{{ billingMoney(dashboard.totals.estimatedMonthlyUsd, dashboard.totals.currency) }}</div>
              <div class="kpi-note">Recurring hosting + AI + domains due in 30 days</div>
            </div>
            <div class="kpi">
              <div class="t">Est. yearly</div>
              <div class="v">{{ billingMoney(dashboard.totals.estimatedYearlyUsd, dashboard.totals.currency) }}</div>
              <div class="kpi-note">12× recurring + domain renewals in the next year</div>
            </div>
          </div>

          <div class="card billing-outlook-card">
            <div class="chead">
              <div>
                <h3>Spend outlook</h3>
                <p class="billing-outlook-sub">Observed charges vs projected run-rate</p>
              </div>
              <span class="pill muted billing-updated">{{ new Date(dashboard.lastRefreshed).toLocaleString() }}</span>
            </div>
            <div class="cbody billing-outlook-body">
              <svg
                class="billing-chart"
                :viewBox="`0 0 ${chart.width} ${chart.height}`"
                role="img"
                aria-label="Billing spend chart"
              >
                <defs>
                  <linearGradient id="billingProjectedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#0f766e" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="#0f766e" stop-opacity="0.02" />
                  </linearGradient>
                </defs>
                <line
                  v-for="tick in 4"
                  :key="tick"
                  class="billing-chart-grid"
                  :x1="chart.padX"
                  :x2="chart.width - chart.padX"
                  :y1="chart.padY + ((chart.height - chart.padY * 2) * (tick - 1)) / 3"
                  :y2="chart.padY + ((chart.height - chart.padY * 2) * (tick - 1)) / 3"
                />
                <path v-if="chart.areaPath" :d="chart.areaPath" fill="url(#billingProjectedFill)" />
                <path
                  v-if="chart.actualPath"
                  :d="chart.actualPath"
                  class="billing-chart-actual"
                  fill="none"
                />
                <path
                  v-if="chart.projectedPath"
                  :d="chart.projectedPath"
                  class="billing-chart-projected"
                  fill="none"
                />
                <g v-for="point in chart.points" :key="point.label">
                  <circle
                    v-if="point.yActual != null"
                    :cx="point.x"
                    :cy="point.yActual"
                    r="3.5"
                    class="billing-chart-dot actual"
                  />
                  <circle
                    v-if="point.yProjected != null"
                    :cx="point.x"
                    :cy="point.yProjected"
                    r="3.5"
                    class="billing-chart-dot projected"
                  />
                  <text :x="point.x" :y="chart.height - 6" class="billing-chart-label" text-anchor="middle">
                    {{ point.label }}
                  </text>
                </g>
              </svg>
              <div class="billing-chart-legend">
                <span><i class="swatch actual" /> Observed</span>
                <span><i class="swatch projected" /> Projected</span>
              </div>
              <dl class="kv billing-breakdown-kv">
                <dt>{{ labels.vultr.category }}</dt>
                <dd>{{ billingMoney(dashboard.totals.breakdown.vultrUsd) }}</dd>
                <dt>{{ labels.cloudflare.category }}</dt>
                <dd>{{ billingMoney(dashboard.totals.breakdown.cloudflareUsd) }}</dd>
                <dt>{{ labels.openrouter.category }}</dt>
                <dd>{{ billingMoney(dashboard.totals.breakdown.openrouterUsd) }}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div class="billing-grid">
          <article class="card billing-provider-card">
            <div class="chead">
              <div>
                <h3>{{ labels.vultr.name }}</h3>
                <span class="billing-cat">{{ labels.vultr.category }}</span>
              </div>
              <span class="pill" :class="billingProviderStatus(dashboard.vultr.configured, !!dashboard.vultr.error).class">
                {{ billingProviderStatus(dashboard.vultr.configured, !!dashboard.vultr.error).label }}
              </span>
            </div>
            <div class="cbody billing-card-body">
              <p v-if="dashboard.vultr.error" class="billing-err">{{ dashboard.vultr.error }}</p>
              <template v-else-if="dashboard.vultr.configured">
                <dl class="kv">
                  <dt>Est. monthly</dt>
                  <dd>{{ formatVultrMonthlyCost(dashboard.vultr.planCostMonthly) }}</dd>
                  <dt>Balance</dt>
                  <dd>{{ billingMoney(dashboard.vultr.accountBalance) }}</dd>
                </dl>

                <div v-if="dashboard.vultr.monitoredInstances.length" class="billing-section">
                  <h4 class="billing-sub">Servers</h4>
                  <ul class="billing-list">
                    <li v-for="inst in dashboard.vultr.monitoredInstances" :key="inst.id" class="billing-server">
                      <div class="billing-server__head">
                        <div class="billing-server__name">{{ inst.label }}</div>
                        <p v-if="inst.hostname && inst.hostname !== inst.label" class="billing-server__hostname mono">
                          {{ inst.hostname }}
                        </p>
                      </div>

                      <div class="billing-server__group">
                        <div class="billing-server__group-title">Compute</div>
                        <dl class="billing-server__details">
                          <div>
                            <dt>Plan</dt>
                            <dd>{{ inst.plan || '—' }}</dd>
                          </div>
                          <div>
                            <dt>Plan cost</dt>
                            <dd>{{ formatVultrMonthlyCost(inst.monthlyPlanCost) }}</dd>
                          </div>
                          <div>
                            <dt>Operating system</dt>
                            <dd>{{ inst.os || '—' }}</dd>
                          </div>
                          <div>
                            <dt>vCPUs</dt>
                            <dd>{{ formatVultrCount(inst.vcpuCount, 'vCPU') }}</dd>
                          </div>
                          <div>
                            <dt>Memory</dt>
                            <dd>{{ formatVultrRam(inst.ramMb) }}</dd>
                          </div>
                          <div>
                            <dt>Storage</dt>
                            <dd>{{ formatVultrDisk(inst.diskGb) }}</dd>
                          </div>
                          <div>
                            <dt>Bandwidth</dt>
                            <dd>{{ formatVultrBandwidth(inst.allowedBandwidthGb) }}</dd>
                          </div>
                        </dl>
                      </div>

                      <div class="billing-server__group">
                        <div class="billing-server__group-title">Location & network</div>
                        <dl class="billing-server__details">
                          <div>
                            <dt>Region</dt>
                            <dd>{{ inst.region || '—' }}</dd>
                          </div>
                          <div v-if="inst.mainIp">
                            <dt>IPv4 address</dt>
                            <dd class="mono">{{ inst.mainIp }}</dd>
                          </div>
                          <div v-if="inst.gatewayV4">
                            <dt>Gateway</dt>
                            <dd class="mono">{{ inst.gatewayV4 }}</dd>
                          </div>
                          <div v-if="inst.v6MainIp">
                            <dt>IPv6 address</dt>
                            <dd class="mono">{{ inst.v6MainIp }}</dd>
                          </div>
                          <div v-if="inst.internalIp">
                            <dt>Internal IP</dt>
                            <dd class="mono">{{ inst.internalIp }}</dd>
                          </div>
                        </dl>
                      </div>

                      <div class="billing-server__group">
                        <div class="billing-server__group-title">Status</div>
                        <dl class="billing-server__details">
                          <div>
                            <dt>Deployment</dt>
                            <dd>{{ formatVultrInstanceStatus(inst.status) }}</dd>
                          </div>
                          <div v-if="inst.powerStatus">
                            <dt>Power</dt>
                            <dd>{{ formatVultrInstanceStatus(inst.powerStatus) }}</dd>
                          </div>
                          <div v-if="inst.serverStatus">
                            <dt>Server health</dt>
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
                          <div v-if="inst.tags.length">
                            <dt>Tags</dt>
                            <dd>{{ inst.tags.join(', ') }}</dd>
                          </div>
                        </dl>
                      </div>
                    </li>
                  </ul>
                </div>

                <div v-if="dashboard.vultr.invoices.length" class="billing-section">
                  <h4 class="billing-sub">Recent invoices</h4>
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
                        <tr v-for="row in dashboard.vultr.invoices" :key="row.id">
                          <td>{{ billingDate(row.date) }}</td>
                          <td>{{ row.description }}</td>
                          <td class="num">{{ billingMoney(row.amount) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </template>
              <p v-else class="billing-muted">Set up in Control Panel → Billing.</p>
            </div>
            <footer class="billing-card-footer">
              <button
                v-if="dashboard.vultr.hasPortalCredentials"
                type="button"
                class="btn billing-cred-btn"
                @click="openReveal('vultr')"
              >
                View credentials
              </button>
              <button type="button" class="btn billing-manage-btn" @click="openProviderAccount('vultr')">
                {{ billingProviderManageLabel('vultr') }}
              </button>
            </footer>
          </article>

          <article class="card billing-provider-card">
            <div class="chead">
              <div>
                <h3>{{ labels.cloudflare.name }}</h3>
                <span class="billing-cat">{{ labels.cloudflare.category }}</span>
              </div>
              <span class="pill" :class="billingProviderStatus(dashboard.cloudflare.configured, !!dashboard.cloudflare.error).class">
                {{ billingProviderStatus(dashboard.cloudflare.configured, !!dashboard.cloudflare.error).label }}
              </span>
            </div>
            <div class="cbody billing-card-body">
              <p v-if="dashboard.cloudflare.error" class="billing-err">{{ dashboard.cloudflare.error }}</p>
              <template v-else-if="dashboard.cloudflare.configured && dashboard.cloudflare.domains.length">
                <ul class="billing-list">
                  <li v-for="domain in dashboard.cloudflare.domains" :key="domain.name" class="billing-server">
                    <div class="billing-server__head">
                      <div class="billing-server__name">{{ domain.name }}</div>
                      <span class="pill sm" :class="billingDaysBadgeClass(domain.daysUntilRenewal)">
                        {{ domain.daysUntilRenewal }}d
                      </span>
                    </div>
                    <div class="billing-server__group">
                      <div class="billing-server__group-title">Registration</div>
                      <dl class="billing-server__details">
                        <div>
                          <dt>Domain name</dt>
                          <dd>{{ domain.name }}</dd>
                        </div>
                        <div>
                          <dt>Expiration date</dt>
                          <dd>{{ billingDate(domain.renewalDate) }}</dd>
                        </div>
                        <div>
                          <dt>Registration date</dt>
                          <dd>{{ billingDate(domain.registeredAt) }}</dd>
                        </div>
                        <div>
                          <dt>Auto renew enabled</dt>
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
              </template>
              <p v-else-if="dashboard.cloudflare.configured" class="billing-muted">
                No registrar domains found for this Cloudflare account.
              </p>
              <p v-else class="billing-muted">Connect Cloudflare in Control Panel → Billing.</p>
            </div>
            <footer class="billing-card-footer">
              <button
                v-if="dashboard.cloudflare.hasPortalCredentials"
                type="button"
                class="btn billing-cred-btn"
                @click="openReveal('cloudflare')"
              >
                View credentials
              </button>
              <button type="button" class="btn billing-manage-btn" @click="openProviderAccount('cloudflare')">
                {{ billingProviderManageLabel('cloudflare') }}
              </button>
            </footer>
          </article>

          <article class="card billing-provider-card">
            <div class="chead">
              <div>
                <h3>{{ labels.openrouter.name }}</h3>
                <span class="billing-cat">{{ labels.openrouter.category }}</span>
              </div>
              <span class="pill" :class="billingProviderStatus(dashboard.openrouter.configured, !!dashboard.openrouter.error).class">
                {{ billingProviderStatus(dashboard.openrouter.configured, !!dashboard.openrouter.error).label }}
              </span>
            </div>
            <div class="cbody billing-card-body">
              <p v-if="dashboard.openrouter.error" class="billing-err">{{ dashboard.openrouter.error }}</p>
              <template v-else-if="dashboard.openrouter.configured">
                <p v-if="dashboard.openrouter.creditsNote" class="billing-note">{{ dashboard.openrouter.creditsNote }}</p>
                <dl class="kv">
                  <dt>Available credit</dt>
                  <dd>{{ openRouterAvailableCredit(dashboard.openrouter) }}</dd>
                  <dt>Used this month</dt>
                  <dd>{{ billingMoney(dashboard.openrouter.usageMonthly) }}</dd>
                  <dt>Used today</dt>
                  <dd>{{ billingMoney(dashboard.openrouter.usageDaily) }}</dd>
                </dl>

                <div v-if="dashboard.openrouter.usageHistory.length" class="billing-section">
                  <h4 class="billing-sub">Recent API usage</h4>
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
                        <tr v-for="row in dashboard.openrouter.usageHistory" :key="row.id">
                          <td>{{ billingDateTime(row.date) }}</td>
                          <td>{{ row.description }}</td>
                          <td class="num">{{ billingMoney(row.amount) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </template>
              <p v-else class="billing-muted">Enable in Control Panel → Billing.</p>
            </div>
            <footer class="billing-card-footer">
              <button
                v-if="dashboard.openrouter.hasPortalCredentials"
                type="button"
                class="btn billing-cred-btn"
                @click="openReveal('openrouter')"
              >
                View credentials
              </button>
              <button type="button" class="btn billing-manage-btn" @click="openProviderAccount('openrouter')">
                {{ billingProviderManageLabel('openrouter') }}
              </button>
            </footer>
          </article>
        </div>
      </div>

      <div v-if="revealOpen" class="billing-modal-backdrop" @click.self="closeReveal">
        <div class="card billing-modal" role="dialog" aria-modal="true" aria-labelledby="billing-cred-title">
          <div class="chead">
            <h3 id="billing-cred-title">
              {{ revealProvider ? `${labels[revealProvider].name} credentials` : 'Credentials' }}
            </h3>
            <button type="button" class="btn sm" @click="closeReveal">Close</button>
          </div>
          <div class="cbody">
            <template v-if="!revealed">
              <p class="billing-muted">Enter your DORINC account password to view the saved portal login.</p>
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
                  {{ revealBusy ? 'Verifying…' : 'Reveal' }}
                </button>
              </div>
            </template>
            <template v-else>
              <dl class="kv">
                <dt>Username</dt>
                <dd class="billing-cred-value">
                  <span>{{ revealed.username || '—' }}</span>
                  <button
                    v-if="revealed.username"
                    type="button"
                    class="btn sm"
                    @click="copyText(revealed.username)"
                  >
                    Copy
                  </button>
                </dd>
                <dt>Password</dt>
                <dd class="billing-cred-value">
                  <span class="mono">{{ showRevealedPassword ? (revealed.password || '—') : (revealed.password ? '••••••••••••' : '—') }}</span>
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
                </dd>
              </dl>
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
  gap: 24px;
}

.billing-summary {
  display: grid;
  grid-template-columns: minmax(240px, 0.9fr) minmax(0, 1.4fr);
  gap: 24px;
  align-items: stretch;
}

@media (max-width: 980px) {
  .billing-summary {
    grid-template-columns: 1fr;
  }
}

.billing-kpis {
  grid-template-columns: 1fr;
  margin-bottom: 0;
  gap: 16px;
}

.kpi-note {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
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
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.billing-chart {
  width: 100%;
  height: auto;
  min-height: 200px;
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

.billing-breakdown-kv {
  margin: 0;
  padding-top: 4px;
  border-top: 1px solid #e2e8f0;
}

.billing-updated {
  font-size: 11px;
  font-weight: 600;
}

.billing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  align-items: stretch;
  margin: 0;
}

@media (max-width: 1100px) {
  .billing-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}

.billing-provider-card {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.billing-card-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 18px;
  padding-bottom: 18px;
  flex: 1;
}

.billing-card-body .kv {
  margin: 0;
}

.billing-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

.billing-section + .billing-section {
  margin-top: 4px;
  padding-top: 20px;
  border-top: 1px solid #e2e8f0;
}

.billing-card-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px 18px;
  margin-top: auto;
  border-top: 1px solid #e2e8f0;
}

.billing-manage-btn,
.billing-cred-btn {
  width: 100%;
  justify-content: center;
  font-weight: 600;
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

.billing-sub {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.billing-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.billing-list li {
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.billing-server__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.billing-server__name {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.billing-server__hostname {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.billing-server__group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.billing-server__head + .billing-server__group {
  padding-top: 0;
  border-top: none;
}

.billing-server__group-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #0f766e;
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

.billing-server__details div {
  min-width: 0;
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
  width: min(440px, 100%);
  margin: 0;
}

.billing-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.billing-cred-value {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
