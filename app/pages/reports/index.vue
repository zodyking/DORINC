<script setup lang="ts">
// Reports — revenue, A/R aging, mechanic productivity (P3-06).
import {
  agingBucketTone,
  defaultReportFromDate,
  defaultReportToDate,
  reportMoney,
  reportPercent,
  reportPeriodLabel,
  reportTabLabel,
  type ReportTab,
} from '~/utils/reports-ui'

definePageMeta({ layout: 'staff' })

const auth = useAuthStore()
const canRead = computed(() => auth.can('reports.read.all'))

const tab = ref<ReportTab>('revenue')
const fromDate = ref(defaultReportFromDate())
const toDate = ref(defaultReportToDate())

const revenueQuery = computed(() => ({ from: fromDate.value, to: toDate.value }))
const productivityQuery = computed(() => ({ from: fromDate.value, to: toDate.value }))

const { data: revenue } = await useFetch<{
  range: { from: string, to: string }
  summary: {
    invoicedTotal: string
    collectedTotal: string
    outstandingTotal: string
    invoiceCount: number
    paidCount: number
  }
  monthly: Array<{ period: string, invoicedTotal: string, collectedTotal: string, invoiceCount: number }>
}>('/api/reports/revenue', { query: revenueQuery, immediate: canRead.value })

const { data: aging } = await useFetch<{
  asOf: string
  grandTotal: string
  grandCount: number
  buckets: Array<{
    key: string
    label: string
    total: string
    count: number
    invoices: Array<{
      id: string
      invoiceNumberFormatted: string
      customerName: string
      dueDate: string | null
      daysPastDue: number
      balanceDue: string
    }>
  }>
}>('/api/reports/aging', { immediate: canRead.value })

const { data: productivity } = await useFetch<{
  range: { from: string, to: string }
  totals: { logsSubmitted: number, logsConverted: number, logsAwaitingReview: number }
  mechanics: Array<{
    mechanicId: string
    mechanicName: string
    logsSubmitted: number
    logsConverted: number
    logsAwaitingReview: number
    conversionRate: number | null
  }>
}>('/api/reports/mechanic-productivity', { query: productivityQuery, immediate: canRead.value })

const tabs: ReportTab[] = ['revenue', 'aging', 'productivity']

const expandedBucket = ref<string | null>('90_plus')
</script>

<template>
  <section v-if="!canRead" class="page active">
    <div class="empty">You do not have permission to view reports.</div>
  </section>

  <section v-else class="page active">
    <div class="pagehead">
      <div>
        <h2>Reports</h2>
        <p>Revenue trends, accounts receivable aging, and mechanic field productivity.</p>
      </div>
    </div>

    <div class="subtabs" role="tablist" aria-label="Report types">
      <button
        v-for="t in tabs"
        :key="t"
        type="button"
        role="tab"
        :class="{ active: tab === t }"
        :aria-selected="tab === t"
        @click="tab = t"
      >
        {{ reportTabLabel(t) }}
      </button>
    </div>

    <div v-if="tab !== 'aging'" class="fsbar" style="margin-top:14px;">
      <div class="fs-group">
        <label for="rep-from">From</label>
        <input id="rep-from" v-model="fromDate" type="date">
      </div>
      <div class="fs-group">
        <label for="rep-to">To</label>
        <input id="rep-to" v-model="toDate" type="date">
      </div>
    </div>

    <!-- Revenue -->
    <template v-if="tab === 'revenue' && revenue">
      <div class="kpi4" style="margin-top:16px;">
        <div class="kpi">
          <div class="lbl">Invoiced</div>
          <div class="val">{{ reportMoney(revenue.summary.invoicedTotal) }}</div>
          <div class="sub">{{ revenue.summary.invoiceCount }} invoices</div>
        </div>
        <div class="kpi">
          <div class="lbl">Collected</div>
          <div class="val">{{ reportMoney(revenue.summary.collectedTotal) }}</div>
          <div class="sub">{{ revenue.summary.paidCount }} paid</div>
        </div>
        <div class="kpi">
          <div class="lbl">Outstanding in range</div>
          <div class="val">{{ reportMoney(revenue.summary.outstandingTotal) }}</div>
          <div class="sub">{{ revenue.range.from }} → {{ revenue.range.to }}</div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="chead"><h3>Monthly revenue</h3></div>
        <div class="cbody" style="padding:0;">
          <table class="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th class="r">Invoiced</th>
                <th class="r">Collected</th>
                <th class="r">Invoices</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!revenue.monthly.length">
                <td colspan="4" class="empty">No invoice data in this range.</td>
              </tr>
              <tr v-for="row in revenue.monthly" :key="row.period">
                <td>{{ reportPeriodLabel(row.period) }}</td>
                <td class="r mono">{{ reportMoney(row.invoicedTotal) }}</td>
                <td class="r mono">{{ reportMoney(row.collectedTotal) }}</td>
                <td class="r">{{ row.invoiceCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Aging -->
    <template v-if="tab === 'aging' && aging">
      <div class="kpi4" style="margin-top:16px;">
        <div class="kpi">
          <div class="lbl">Total A/R</div>
          <div class="val">{{ reportMoney(aging.grandTotal) }}</div>
          <div class="sub">As of {{ aging.asOf }}</div>
        </div>
        <div class="kpi">
          <div class="lbl">Open invoices</div>
          <div class="val">{{ aging.grandCount }}</div>
          <div class="sub">Sent or approved with balance</div>
        </div>
      </div>

      <div class="kpi4" style="margin-top:14px;">
        <div v-for="bucket in aging.buckets" :key="bucket.key" class="kpi">
          <div class="lbl">
            <span :class="['pill', agingBucketTone(bucket.key)]">{{ bucket.label }}</span>
          </div>
          <div class="val">{{ reportMoney(bucket.total) }}</div>
          <div class="sub">{{ bucket.count }} invoice{{ bucket.count === 1 ? '' : 's' }}</div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="chead"><h3>A/R detail</h3></div>
        <div class="cbody" style="padding:0;">
          <template v-for="bucket in aging.buckets" :key="bucket.key">
            <div v-if="bucket.count" class="rep-bucket">
              <button
                type="button"
                class="rep-bucket-head"
                @click="expandedBucket = expandedBucket === bucket.key ? null : bucket.key"
              >
                <span :class="['pill', agingBucketTone(bucket.key)]">{{ bucket.label }}</span>
                <span class="mono">{{ reportMoney(bucket.total) }} · {{ bucket.count }}</span>
              </button>
              <table v-if="expandedBucket === bucket.key" class="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Due</th>
                    <th class="r">Days past due</th>
                    <th class="r">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="inv in bucket.invoices" :key="inv.id">
                    <td>
                      <NuxtLink :to="`/invoices/${inv.id}`" class="mono">{{ inv.invoiceNumberFormatted }}</NuxtLink>
                    </td>
                    <td>{{ inv.customerName }}</td>
                    <td class="mono">{{ inv.dueDate ?? '—' }}</td>
                    <td class="r">{{ inv.daysPastDue }}</td>
                    <td class="r mono">{{ reportMoney(inv.balanceDue) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <div v-if="!aging.grandCount" class="empty" style="padding:24px;">No outstanding receivables.</div>
        </div>
      </div>
    </template>

    <!-- Mechanic productivity -->
    <template v-if="tab === 'productivity' && productivity">
      <div class="kpi4" style="margin-top:16px;">
        <div class="kpi">
          <div class="lbl">Logs submitted</div>
          <div class="val">{{ productivity.totals.logsSubmitted }}</div>
        </div>
        <div class="kpi">
          <div class="lbl">Converted to invoice</div>
          <div class="val">{{ productivity.totals.logsConverted }}</div>
        </div>
        <div class="kpi">
          <div class="lbl">Awaiting review</div>
          <div class="val">{{ productivity.totals.logsAwaitingReview }}</div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="chead"><h3>By mechanic</h3></div>
        <div class="cbody" style="padding:0;">
          <table class="tbl">
            <thead>
              <tr>
                <th>Mechanic</th>
                <th class="r">Submitted</th>
                <th class="r">Converted</th>
                <th class="r">In review</th>
                <th class="r">Conversion</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!productivity.mechanics.length">
                <td colspan="5" class="empty">No service logs in this range.</td>
              </tr>
              <tr v-for="m in productivity.mechanics" :key="m.mechanicId">
                <td>{{ m.mechanicName }}</td>
                <td class="r">{{ m.logsSubmitted }}</td>
                <td class="r">{{ m.logsConverted }}</td>
                <td class="r">{{ m.logsAwaitingReview }}</td>
                <td class="r mono">{{ reportPercent(m.conversionRate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.rep-bucket { border-top:1px solid #f1f5f9; }
.rep-bucket-head {
  width:100%; display:flex; justify-content:space-between; align-items:center;
  padding:12px 16px; background:#fafbfc; border:none; cursor:pointer; font:inherit; text-align:left;
}
.rep-bucket-head:hover { background:#f1f5f9; }
</style>
