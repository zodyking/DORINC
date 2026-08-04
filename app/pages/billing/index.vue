<script setup lang="ts">
import type { BillingDashboardPayload } from '#shared/validators/billing-integrations'
import { BILLING_PROVIDER_LABELS } from '~/utils/billing-ui'

definePageMeta({ layout: 'staff', permission: 'billing.read.all' })

interface DashboardResponse {
  dashboard: BillingDashboardPayload
}

const labels = BILLING_PROVIDER_LABELS

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

function providerStatus(configured: boolean, hasError: boolean): { label: string, class: string } {
  if (hasError) return { label: 'Error', class: 'danger' }
  if (configured) return { label: 'Connected', class: 'ok' }
  return { label: 'Not configured', class: 'muted' }
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
    <StaffPageHead subtitle="Infrastructure spend across web hosting, domain renewals, and AI usage">
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
      <section class="billing-hero card">
        <div class="cbody hero-body">
          <div class="hero-summary">
            <div class="hero-stat primary">
              <span class="hero-label">Estimated monthly cost</span>
              <strong class="hero-value">{{ money(dashboard.totals.estimatedMonthlyUsd, dashboard.totals.currency) }}</strong>
              <span class="hero-sub">Web hosting MTD + AI monthly usage + domain renewals in 30 days</span>
            </div>
            <div class="hero-divider" aria-hidden="true" />
            <div class="hero-stat">
              <span class="hero-label">Estimated yearly cost</span>
              <strong class="hero-value">{{ money(dashboard.totals.estimatedYearlyUsd, dashboard.totals.currency) }}</strong>
              <span class="hero-sub">Projected from current usage and renewals within 12 months</span>
            </div>
          </div>
          <p class="hero-meta">Last refreshed {{ new Date(dashboard.lastRefreshed).toLocaleString() }}</p>
        </div>
      </section>

      <section class="billing-breakdown card">
        <div class="chead">
          <h3>Monthly cost breakdown</h3>
        </div>
        <div class="cbody">
          <ul class="breakdown-list">
            <li>
              <div class="breakdown-copy">
                <span class="breakdown-name">{{ labels.vultr.name }}</span>
                <span class="breakdown-category">{{ labels.vultr.category }}</span>
              </div>
              <span class="breakdown-amount">{{ money(dashboard.totals.breakdown.vultrUsd) }}</span>
            </li>
            <li>
              <div class="breakdown-copy">
                <span class="breakdown-name">{{ labels.openrouter.name }}</span>
                <span class="breakdown-category">{{ labels.openrouter.category }}</span>
              </div>
              <span class="breakdown-amount">{{ money(dashboard.totals.breakdown.openrouterUsd) }}</span>
            </li>
            <li>
              <div class="breakdown-copy">
                <span class="breakdown-name">{{ labels.namecheap.name }}</span>
                <span class="breakdown-category">{{ labels.namecheap.category }}</span>
              </div>
              <span class="breakdown-amount">{{ money(dashboard.totals.breakdown.namecheapUsd) }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="billing-providers">
        <article class="card provider-section">
          <header class="provider-head">
            <div class="provider-title">
              <h3>{{ labels.vultr.name }}</h3>
              <span class="provider-category">{{ labels.vultr.category }}</span>
            </div>
            <span
              class="pill"
              :class="providerStatus(dashboard.vultr.configured, !!dashboard.vultr.error).class"
            >
              {{ providerStatus(dashboard.vultr.configured, !!dashboard.vultr.error).label }}
            </span>
          </header>
          <div class="cbody provider-body">
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

              <div v-if="dashboard.vultr.monitoredInstances.length" class="provider-subsection">
                <h4>Monitored servers</h4>
                <ul class="mini-list">
                  <li v-for="inst in dashboard.vultr.monitoredInstances" :key="inst.id">
                    <b>{{ inst.label }}</b>
                    <span>{{ inst.region }} · {{ inst.plan }} · {{ inst.status }}</span>
                  </li>
                </ul>
              </div>
              <p v-else class="muted">No servers selected — choose instances in Control Panel → Billing.</p>

              <div v-if="dashboard.vultr.invoices.length" class="provider-subsection">
                <h4>Recent invoices</h4>
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
                        <td>{{ formatDate(row.date) }}</td>
                        <td>{{ row.description }}</td>
                        <td class="num">{{ money(row.amount) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
            <p v-else class="muted">Configure {{ labels.vultr.name }} ({{ labels.vultr.category }}) in Control Panel → Billing.</p>
          </div>
        </article>

        <article class="card provider-section">
          <header class="provider-head">
            <div class="provider-title">
              <h3>{{ labels.namecheap.name }}</h3>
              <span class="provider-category">{{ labels.namecheap.category }}</span>
            </div>
            <span
              class="pill"
              :class="providerStatus(dashboard.namecheap.configured, !!dashboard.namecheap.error).class"
            >
              {{ providerStatus(dashboard.namecheap.configured, !!dashboard.namecheap.error).label }}
            </span>
          </header>
          <div class="cbody provider-body">
            <p v-if="dashboard.namecheap.error" class="err">{{ dashboard.namecheap.error }}</p>
            <template v-if="dashboard.namecheap.configured">
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
                        <span v-if="domain.source === 'manual'" class="tag manual">Manual</span>
                        <span v-else-if="domain.autoRenew" class="tag">Auto-renew</span>
                      </td>
                      <td>{{ domain.renewalDate }}</td>
                      <td><span class="pill sm" :class="daysBadgeClass(domain.daysUntilRenewal)">{{ domain.daysUntilRenewal }}d</span></td>
                      <td class="num">{{ renewalCostLabel(domain) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="muted">No domains configured — add manual domains or an API watch list in Control Panel → Billing.</p>
            </template>
            <p v-else class="muted">Configure {{ labels.namecheap.name }} ({{ labels.namecheap.category }}) in Control Panel → Billing.</p>
          </div>
        </article>

        <article class="card provider-section">
          <header class="provider-head">
            <div class="provider-title">
              <h3>{{ labels.openrouter.name }}</h3>
              <span class="provider-category">{{ labels.openrouter.category }}</span>
            </div>
            <span
              class="pill"
              :class="providerStatus(dashboard.openrouter.configured, !!dashboard.openrouter.error).class"
            >
              {{ providerStatus(dashboard.openrouter.configured, !!dashboard.openrouter.error).label }}
            </span>
          </header>
          <div class="cbody provider-body">
            <p v-if="dashboard.openrouter.error" class="err">{{ dashboard.openrouter.error }}</p>
            <p v-else-if="dashboard.openrouter.creditsNote" class="note">{{ dashboard.openrouter.creditsNote }}</p>
            <template v-if="dashboard.openrouter.configured && !dashboard.openrouter.error">
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
            <p v-else class="muted">Enable OpenRouter billing and configure the API key in Control Panel → AI.</p>
          </div>
        </article>
      </section>
    </template>
  </section>
</template>

<style scoped>
.billing-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.billing-hero {
  border-color: #c7d2fe;
  background: linear-gradient(135deg, #eef2ff 0%, #fff 55%);
}

.hero-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.hero-summary {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 24px;
  align-items: stretch;
}

@media (max-width: 720px) {
  .hero-summary {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .hero-divider {
    display: none;
  }
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.hero-value {
  font-size: clamp(1.75rem, 4vw, 2.35rem);
  line-height: 1.1;
  color: #0f172a;
}

.hero-sub {
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
  max-width: 36ch;
}

.hero-divider {
  width: 1px;
  background: #cbd5e1;
  margin: 4px 0;
}

.hero-meta {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.breakdown-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.breakdown-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid #e2e8f0;
}

.breakdown-list li:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.breakdown-list li:first-child {
  padding-top: 0;
}

.breakdown-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.breakdown-name {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.breakdown-category {
  font-size: 12px;
  color: #64748b;
}

.breakdown-amount {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
}

.billing-providers {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.provider-section {
  overflow: hidden;
}

.provider-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.provider-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.provider-head h3 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.provider-category {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #6366f1;
  text-transform: uppercase;
}

.provider-body {
  padding-top: 20px;
  padding-bottom: 20px;
}

.provider-subsection {
  margin-top: 24px;
}

.provider-subsection:first-of-type {
  margin-top: 4px;
}

.provider-subsection h4 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

@media (max-width: 900px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }
}

.metric-grid div {
  padding: 12px 14px;
  border-radius: 10px;
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

.mini-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mini-list li {
  padding: 12px 14px;
  border-radius: 10px;
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
  padding: 10px 12px;
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

.tag.manual {
  color: #7c3aed;
  background: #ede9fe;
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

.note {
  color: #64748b;
  font-size: 13px;
  margin: 0 0 12px;
  line-height: 1.45;
}

.alert-card {
  border-color: #fecaca;
}
</style>
