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
  formatVultrBandwidth,
  formatVultrCount,
  formatVultrDisk,
  formatVultrFeatureList,
  formatVultrInstanceStatus,
  formatVultrMonthlyCost,
  formatVultrRam,
} from '~/utils/billing-ui'

definePageMeta({ layout: 'staff', permission: 'billing.read.all' })

interface DashboardResponse {
  dashboard: BillingDashboardPayload
}

const labels = BILLING_PROVIDER_LABELS

const { data, pending, error, refresh } = useClientFetch<DashboardResponse>('/api/billing/dashboard')

const dashboard = computed(() => data.value?.dashboard)

function renewalCostLabel(domain: BillingDashboardPayload['namecheap']['domains'][number]): string {
  return billingMoney(domain.renewalCost, domain.currency)
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
</script>

<template>
  <section class="page active billing-page">
    <StaffPageHead subtitle="Monthly infrastructure spend">
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
      <div class="kpis billing-kpis">
        <div class="kpi">
          <div class="t">Est. monthly</div>
          <div class="v">{{ billingMoney(dashboard.totals.estimatedMonthlyUsd, dashboard.totals.currency) }}</div>
        </div>
        <div class="kpi">
          <div class="t">Est. yearly</div>
          <div class="v">{{ billingMoney(dashboard.totals.estimatedYearlyUsd, dashboard.totals.currency) }}</div>
        </div>
      </div>

      <div class="card billing-breakdown-card">
        <div class="chead">
          <h3>Breakdown</h3>
          <span class="pill muted billing-updated">{{ new Date(dashboard.lastRefreshed).toLocaleString() }}</span>
        </div>
        <dl class="kv">
          <dt>{{ labels.vultr.category }}</dt>
          <dd>{{ billingMoney(dashboard.totals.breakdown.vultrUsd) }}</dd>
          <dt>{{ labels.openrouter.category }}</dt>
          <dd>{{ billingMoney(dashboard.totals.breakdown.openrouterUsd) }}</dd>
          <dt>{{ labels.namecheap.category }}</dt>
          <dd>{{ billingMoney(dashboard.totals.breakdown.namecheapUsd) }}</dd>
        </dl>
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
            <button type="button" class="btn billing-manage-btn" @click="openProviderAccount('vultr')">
              {{ billingProviderManageLabel('vultr') }}
            </button>
          </footer>
        </article>

        <article class="card billing-provider-card">
          <div class="chead">
            <div>
              <h3>{{ labels.namecheap.name }}</h3>
              <span class="billing-cat">{{ labels.namecheap.category }}</span>
            </div>
            <span class="pill" :class="billingProviderStatus(dashboard.namecheap.configured, !!dashboard.namecheap.error).class">
              {{ billingProviderStatus(dashboard.namecheap.configured, !!dashboard.namecheap.error).label }}
            </span>
          </div>
          <div class="cbody billing-card-body">
            <p v-if="dashboard.namecheap.error" class="billing-err">{{ dashboard.namecheap.error }}</p>
            <template v-else-if="dashboard.namecheap.configured && dashboard.namecheap.domains.length">
              <div class="tscroll">
                <table class="tbl compact">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Renewal</th>
                      <th>Days</th>
                      <th class="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="domain in dashboard.namecheap.domains" :key="domain.name">
                      <td>{{ domain.name }}</td>
                      <td>{{ domain.renewalDate }}</td>
                      <td><span class="pill sm" :class="billingDaysBadgeClass(domain.daysUntilRenewal)">{{ domain.daysUntilRenewal }}d</span></td>
                      <td class="num">{{ renewalCostLabel(domain) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <p v-else class="billing-muted">Add domains in Control Panel → Billing.</p>
          </div>
          <footer class="billing-card-footer">
            <button type="button" class="btn billing-manage-btn" @click="openProviderAccount('namecheap')">
              {{ billingProviderManageLabel('namecheap') }}
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
            <button type="button" class="btn billing-manage-btn" @click="openProviderAccount('openrouter')">
              {{ billingProviderManageLabel('openrouter') }}
            </button>
          </footer>
        </article>
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

.billing-kpis {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 0;
}

.billing-breakdown-card {
  margin: 0;
}

.billing-breakdown-card .kv {
  padding-top: 4px;
  padding-bottom: 4px;
}

.billing-updated {
  font-size: 11px;
  font-weight: 600;
}

.billing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  align-items: start;
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
}

.billing-card-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 18px;
  padding-bottom: 18px;
}

.billing-card-body .kv {
  margin: 0;
}

.billing-card-body .kv + .billing-sub,
.billing-card-body .billing-note + .kv {
  margin-top: 0;
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
  padding: 16px 18px 18px;
  margin-top: auto;
  border-top: 1px solid #e2e8f0;
}

.billing-manage-btn {
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
  color: #6366f1;
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
  flex-direction: column;
  gap: 4px;
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
  color: #6366f1;
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

.billing-server__details dd.mono {
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
</style>
