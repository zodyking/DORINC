<script setup lang="ts">
import type { BillingDashboardPayload } from '#shared/validators/billing-integrations'

definePageMeta({ layout: 'staff', permission: 'billing.read.all' })

interface DashboardResponse {
  dashboard: BillingDashboardPayload
}

const { data, pending, error, refresh } = useClientFetch<DashboardResponse>('/api/billing/dashboard')

const dashboard = computed(() => data.value?.dashboard)

function money(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString()
}

function renewalCostLabel(domain: BillingDashboardPayload['namecheap']['domains'][number]): string {
  if (domain.renewalCostStatus === 'premium-domain-price-unavailable') return 'Premium — price unavailable'
  if (domain.renewalCostStatus === 'pricing-unavailable') return 'Pricing unavailable'
  return money(domain.renewalCost, domain.currency)
}

function daysBadgeClass(days: number): string {
  if (days < 0) return 'danger'
  if (days <= 30) return 'warn'
  if (days <= 90) return 'amber'
  return 'ok'
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
    <StaffPageHead subtitle="Vultr usage, Namecheap renewals, and OpenRouter credits">
      <template #title>Billing</template>
      <template #actions>
        <button type="button" class="btn" :disabled="refreshBusy || pending" @click="reload">
          {{ refreshBusy || pending ? 'Refreshing…' : 'Refresh' }}
        </button>
      </template>
    </StaffPageHead>

    <div v-if="error" class="card alert-card">
      <div class="cbody">
        <p>Could not load billing data.</p>
      </div>
    </div>

    <div v-else-if="pending && !dashboard" class="card">
      <div class="cbody">Loading billing monitor…</div>
    </div>

    <template v-else-if="dashboard">
      <div class="kpi-grid">
        <div class="kpi-card primary">
          <span class="kpi-label">Estimated monthly cost</span>
          <strong class="kpi-value">{{ money(dashboard.totals.estimatedMonthlyUsd, dashboard.totals.currency) }}</strong>
          <span class="kpi-sub">Vultr MTD + OpenRouter monthly + domains renewing in 30 days</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Estimated yearly cost</span>
          <strong class="kpi-value">{{ money(dashboard.totals.estimatedYearlyUsd, dashboard.totals.currency) }}</strong>
          <span class="kpi-sub">Projected from current usage and renewals within 12 months</span>
        </div>
      </div>

      <div class="breakdown card">
        <div class="chead"><h3>Cost breakdown (monthly estimate)</h3></div>
        <dl class="kv">
          <dt>Vultr (month to date)</dt>
          <dd>{{ money(dashboard.totals.breakdown.vultrUsd) }}</dd>
          <dt>OpenRouter (monthly usage)</dt>
          <dd>{{ money(dashboard.totals.breakdown.openrouterUsd) }}</dd>
          <dt>Namecheap (renewals ≤30 days)</dt>
          <dd>{{ money(dashboard.totals.breakdown.namecheapUsd) }}</dd>
        </dl>
        <p class="foot-note">Last refreshed {{ new Date(dashboard.lastRefreshed).toLocaleString() }}</p>
      </div>

      <div class="provider-grid">
        <article class="card provider-card">
          <div class="chead">
            <h3>Vultr</h3>
            <span class="pill" :class="dashboard.vultr.error ? 'danger' : dashboard.vultr.configured ? 'ok' : 'muted'">
              {{ dashboard.vultr.error ? 'Error' : dashboard.vultr.configured ? 'Connected' : 'Not configured' }}
            </span>
          </div>
          <div class="cbody">
            <p v-if="dashboard.vultr.error" class="err">{{ dashboard.vultr.error }}</p>
            <template v-else-if="dashboard.vultr.configured">
              <dl class="metric-grid">
                <div>
                  <dt>Month-to-date usage</dt>
                  <dd>{{ money(dashboard.vultr.monthToDateUsage) }}</dd>
                </div>
                <div>
                  <dt>Account balance</dt>
                  <dd>{{ money(dashboard.vultr.accountBalance) }}</dd>
                </div>
                <div>
                  <dt>Last payment</dt>
                  <dd>{{ money(dashboard.vultr.lastPaymentAmount) }} · {{ formatDate(dashboard.vultr.lastPaymentDate) }}</dd>
                </div>
              </dl>

              <h4 v-if="dashboard.vultr.monitoredInstances.length">Monitored servers</h4>
              <ul v-if="dashboard.vultr.monitoredInstances.length" class="mini-list">
                <li v-for="inst in dashboard.vultr.monitoredInstances" :key="inst.id">
                  <b>{{ inst.label }}</b>
                  <span>{{ inst.region }} · {{ inst.plan }} · {{ inst.status }}</span>
                </li>
              </ul>
              <p v-else class="muted">No servers selected — choose instances in Control Panel → Billing.</p>

              <h4 v-if="dashboard.vultr.invoices.length">Recent invoices</h4>
              <div v-if="dashboard.vultr.invoices.length" class="tscroll">
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
                      <td>{{ formatDate(row.date) }}</td>
                      <td>{{ row.description }}</td>
                      <td class="num">{{ money(row.amount) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <p v-else class="muted">Configure Vultr in Control Panel → Billing.</p>
          </div>
        </article>

        <article class="card provider-card">
          <div class="chead">
            <h3>Namecheap</h3>
            <span class="pill" :class="dashboard.namecheap.error ? 'danger' : dashboard.namecheap.configured ? 'ok' : 'muted'">
              {{ dashboard.namecheap.error ? 'Error' : dashboard.namecheap.configured ? 'Connected' : 'Not configured' }}
            </span>
          </div>
          <div class="cbody">
            <p v-if="dashboard.namecheap.error" class="err">{{ dashboard.namecheap.error }}</p>
            <template v-else-if="dashboard.namecheap.configured">
              <div v-if="dashboard.namecheap.domains.length" class="tscroll">
                <table class="tbl compact">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Renewal</th>
                      <th>Days</th>
                      <th class="num">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="domain in dashboard.namecheap.domains" :key="domain.name">
                      <td>
                        <b>{{ domain.name }}</b>
                        <span v-if="domain.autoRenew" class="tag">Auto-renew</span>
                      </td>
                      <td>{{ domain.renewalDate }}</td>
                      <td><span class="pill sm" :class="daysBadgeClass(domain.daysUntilRenewal)">{{ domain.daysUntilRenewal }}d</span></td>
                      <td class="num">{{ renewalCostLabel(domain) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="muted">No domains selected — choose domains in Control Panel → Billing.</p>
            </template>
            <p v-else class="muted">Configure Namecheap in Control Panel → Billing.</p>
          </div>
        </article>

        <article class="card provider-card">
          <div class="chead">
            <h3>OpenRouter</h3>
            <span class="pill" :class="dashboard.openrouter.error ? 'danger' : dashboard.openrouter.configured ? 'ok' : 'muted'">
              {{ dashboard.openrouter.error ? 'Error' : dashboard.openrouter.configured ? 'Connected' : 'Not configured' }}
            </span>
          </div>
          <div class="cbody">
            <p v-if="dashboard.openrouter.error" class="err">{{ dashboard.openrouter.error }}</p>
            <template v-else-if="dashboard.openrouter.configured">
              <dl class="metric-grid">
                <div>
                  <dt>Remaining credits</dt>
                  <dd>{{ money(dashboard.openrouter.remainingCredits) }}</dd>
                </div>
                <div>
                  <dt>Total purchased</dt>
                  <dd>{{ money(dashboard.openrouter.totalCredits) }}</dd>
                </div>
                <div>
                  <dt>Total usage</dt>
                  <dd>{{ money(dashboard.openrouter.totalUsage) }}</dd>
                </div>
                <div>
                  <dt>Monthly key usage</dt>
                  <dd>{{ money(dashboard.openrouter.usageMonthly) }}</dd>
                </div>
                <div>
                  <dt>Daily key usage</dt>
                  <dd>{{ money(dashboard.openrouter.usageDaily) }}</dd>
                </div>
                <div v-if="dashboard.openrouter.internalMonthlyUsd != null">
                  <dt>Internal AI estimate (month)</dt>
                  <dd>{{ money(dashboard.openrouter.internalMonthlyUsd) }}</dd>
                </div>
              </dl>
            </template>
            <p v-else class="muted">Enable OpenRouter billing in Control Panel → Billing.</p>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.billing-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 720px) {
  .kpi-grid { grid-template-columns: 1fr; }
}

.kpi-card {
  padding: 18px 20px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kpi-card.primary {
  border-color: #c7d2fe;
  background: linear-gradient(135deg, #eef2ff 0%, #fff 100%);
}

.kpi-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.kpi-value {
  font-size: clamp(1.5rem, 4vw, 2rem);
  color: #0f172a;
}

.kpi-sub {
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.4;
}

.breakdown .foot-note {
  margin: 12px 16px 16px;
  font-size: 12px;
  color: #94a3b8;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 1100px) {
  .provider-grid { grid-template-columns: 1fr; }
}

.provider-card h4 {
  margin: 16px 0 8px;
  font-size: 13px;
  color: #334155;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.metric-grid div {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.metric-grid dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
  margin-bottom: 4px;
}

.metric-grid dd {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

@media (max-width: 520px) {
  .metric-grid { grid-template-columns: 1fr; }
}

.mini-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mini-list li {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.mini-list span {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.tbl.compact th,
.tbl.compact td {
  font-size: 12.5px;
  padding: 8px 10px;
}

.tag {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 600;
  color: #0369a1;
  background: #e0f2fe;
  padding: 2px 6px;
  border-radius: 999px;
}

.pill.sm {
  font-size: 11px;
  padding: 2px 8px;
}

.pill.muted { background: #f1f5f9; color: #64748b; }
.pill.amber { background: #fef3c7; color: #b45309; }

.muted {
  color: #64748b;
  font-size: 13px;
}

.err {
  color: #dc2626;
  font-size: 13px;
}

.alert-card {
  border-color: #fecaca;
}
</style>
