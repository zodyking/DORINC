<script setup lang="ts">
import type { BillingDashboardPayload } from '#shared/validators/billing-integrations'
import {
  BILLING_PROVIDER_LABELS,
  billingDate,
  billingDaysBadgeClass,
  billingMoney,
  billingProviderStatus,
} from '~/utils/billing-ui'

definePageMeta({ layout: 'staff', permission: 'billing.read.all' })

interface DashboardResponse {
  dashboard: BillingDashboardPayload
}

const labels = BILLING_PROVIDER_LABELS

const { data, pending, error, refresh } = useClientFetch<DashboardResponse>('/api/billing/dashboard')

const dashboard = computed(() => data.value?.dashboard)

function renewalCostLabel(domain: BillingDashboardPayload['namecheap']['domains'][number]): string {
  if (domain.renewalCostStatus === 'premium-domain-price-unavailable') return 'Premium'
  if (domain.renewalCostStatus === 'pricing-unavailable') return '—'
  return billingMoney(domain.renewalCost, domain.currency)
}

function openRouterAvailableCredit(d: BillingDashboardPayload['openrouter']): string {
  if (d.remainingCredits != null) return billingMoney(d.remainingCredits)
  if (d.limitRemaining != null) return billingMoney(d.limitRemaining)
  return '—'
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
  <section class="page active">
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

      <div class="card">
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
        <article class="card">
          <div class="chead">
            <div>
              <h3>{{ labels.vultr.name }}</h3>
              <span class="billing-cat">{{ labels.vultr.category }}</span>
            </div>
            <span class="pill" :class="billingProviderStatus(dashboard.vultr.configured, !!dashboard.vultr.error).class">
              {{ billingProviderStatus(dashboard.vultr.configured, !!dashboard.vultr.error).label }}
            </span>
          </div>
          <div class="cbody">
            <p v-if="dashboard.vultr.error" class="billing-err">{{ dashboard.vultr.error }}</p>
            <template v-else-if="dashboard.vultr.configured">
              <dl class="kv">
                <dt>MTD usage</dt>
                <dd>{{ billingMoney(dashboard.vultr.monthToDateUsage) }}</dd>
                <dt>Balance</dt>
                <dd>{{ billingMoney(dashboard.vultr.accountBalance) }}</dd>
                <dt>Last payment</dt>
                <dd>{{ billingMoney(dashboard.vultr.lastPaymentAmount) }} · {{ billingDate(dashboard.vultr.lastPaymentDate) }}</dd>
              </dl>

              <template v-if="dashboard.vultr.monitoredInstances.length">
                <h4 class="billing-sub">Servers</h4>
                <ul class="billing-list">
                  <li v-for="inst in dashboard.vultr.monitoredInstances" :key="inst.id">
                    <strong>{{ inst.label }}</strong>
                    <span>{{ inst.region }} · {{ inst.plan }}</span>
                  </li>
                </ul>
              </template>

              <template v-if="dashboard.vultr.invoices.length">
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
              </template>
            </template>
            <p v-else class="billing-muted">Set up in Control Panel → Billing.</p>
          </div>
        </article>

        <article class="card">
          <div class="chead">
            <div>
              <h3>{{ labels.namecheap.name }}</h3>
              <span class="billing-cat">{{ labels.namecheap.category }}</span>
            </div>
            <span class="pill" :class="billingProviderStatus(dashboard.namecheap.configured, !!dashboard.namecheap.error).class">
              {{ billingProviderStatus(dashboard.namecheap.configured, !!dashboard.namecheap.error).label }}
            </span>
          </div>
          <div class="cbody">
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
        </article>

        <article class="card">
          <div class="chead">
            <div>
              <h3>{{ labels.openrouter.name }}</h3>
              <span class="billing-cat">{{ labels.openrouter.category }}</span>
            </div>
            <span class="pill" :class="billingProviderStatus(dashboard.openrouter.configured, !!dashboard.openrouter.error).class">
              {{ billingProviderStatus(dashboard.openrouter.configured, !!dashboard.openrouter.error).label }}
            </span>
          </div>
          <div class="cbody">
            <p v-if="dashboard.openrouter.error" class="billing-err">{{ dashboard.openrouter.error }}</p>
            <template v-else-if="dashboard.openrouter.configured">
              <p v-if="dashboard.openrouter.creditsNote" class="billing-note">{{ dashboard.openrouter.creditsNote }}</p>
              <dl class="kv">
                <dt>Available credit</dt>
                <dd>{{ openRouterAvailableCredit(dashboard.openrouter) }}</dd>
                <dt>Purchased</dt>
                <dd>{{ billingMoney(dashboard.openrouter.totalCredits) }}</dd>
                <dt>Used</dt>
                <dd>{{ billingMoney(dashboard.openrouter.totalUsage) }}</dd>
                <dt>This month</dt>
                <dd>{{ billingMoney(dashboard.openrouter.usageMonthly) }}</dd>
                <dt>Today</dt>
                <dd>{{ billingMoney(dashboard.openrouter.usageDaily) }}</dd>
              </dl>
            </template>
            <p v-else class="billing-muted">Enable in Control Panel → Billing.</p>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.billing-kpis {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 18px;
}

.billing-updated {
  font-size: 11px;
  font-weight: 600;
}

.billing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}

@media (max-width: 1100px) {
  .billing-grid {
    grid-template-columns: 1fr;
  }
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
  margin: 18px 0 10px;
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
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.billing-list span {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #64748b;
}

.billing-muted,
.billing-note {
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
  padding: 8px 10px;
}
</style>
