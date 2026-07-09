<script setup lang="ts">
// Invoices list — KPI cards, status chips, filters, table (mockup: PAGE: INVOICES).
import type { InvoiceVehicleSnapshotDisplay } from '~/utils/invoices-ui'

definePageMeta({ layout: 'staff' })

type StatusChip = 'all' | 'draft' | 'pending_manager_approval' | 'sent' | 'overdue' | 'paid'

interface InvoiceRow {
  id: string
  invoiceNumber: number
  invoiceNumberFormatted: string
  status: InvoiceStatus
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
  customerName: string
  vehicleSnapshot: InvoiceVehicleSnapshotDisplay | null
}

interface InvoiceStats {
  total: number
  draftCount: number
  pendingManagerApprovalCount?: number
  sentCount: number
  paidCount: number
  overdueCount: number
  outstandingTotal: string
  outstandingCount: number
  paidThisMonthTotal: string
  overdueTotal: string
}

const route = useRoute()
const auth = useAuthStore()
const canRead = computed(() => auth.can('invoices.read.all'))
const canCreate = computed(() => auth.can('invoices.create.all'))
const canVoidInvoice = computed(() =>
  auth.can('invoices.void.all') && auth.can('deletion_requests.review.all'),
)
const canRequestDeletion = computed(() =>
  auth.can('deletion_requests.submit.all') && !canVoidInvoice.value,
)

const voidBusyId = ref('')

const q = ref('')
const statusChip = ref<StatusChip>((route.query.status as StatusChip) || 'all')
const page = ref(1)
const PAGE_SIZE = 25

watch([q, statusChip], () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  status: statusChip.value === 'all' || statusChip.value === 'overdue'
    ? undefined
    : statusChip.value,
  overdue: statusChip.value === 'overdue' ? true : undefined,
  sort: 'newest' as const,
}))

const { data: stats, refresh: refreshStats } = await useFetch<InvoiceStats>('/api/invoices/stats')
const { data, refresh: refreshList } = await useFetch<{ items: InvoiceRow[], total: number }>('/api/invoices', { query })

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const chips = computed(() => [
  { key: 'all' as const, label: 'All', count: stats.value?.total ?? 0 },
  { key: 'draft' as const, label: 'Draft', count: stats.value?.draftCount ?? 0 },
  { key: 'pending_manager_approval' as const, label: 'Pending approval', count: stats.value?.pendingManagerApprovalCount ?? 0 },
  { key: 'sent' as const, label: 'Sent', count: stats.value?.sentCount ?? 0 },
  { key: 'overdue' as const, label: 'Overdue', count: stats.value?.overdueCount ?? 0 },
  { key: 'paid' as const, label: 'Paid', count: stats.value?.paidCount ?? 0 },
])

const rangeLabel = computed(() => {
  if (!total.value) return 'No invoices'
  const from = (page.value - 1) * PAGE_SIZE + 1
  const to = Math.min(page.value * PAGE_SIZE, total.value)
  return `Showing ${from}—${to} of ${total.value}`
})

const subtitle = computed(() => {
  const n = stats.value?.total ?? 0
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return `${n} invoice${n === 1 ? '' : 's'} · ${month}`
})

function openInvoice(id: string) {
  navigateTo(`/invoices/${id}`)
}

function removableRow(row: InvoiceRow) {
  return row.status !== 'void' && row.status !== 'paid'
}

async function voidInvoiceRow(row: InvoiceRow, event: Event) {
  event.stopPropagation()
  if (!canVoidInvoice.value || !removableRow(row)) return
  if (!window.confirm(`Void ${row.invoiceNumberFormatted}? The invoice stays on file with a voided status.`)) return
  voidBusyId.value = row.id
  try {
    await $fetch(`/api/invoices/${row.id}/void`, { method: 'POST' })
    await Promise.all([refreshList(), refreshStats()])
  }
  catch (e: unknown) {
    const msg = (e as { data?: { message?: string } })?.data?.message ?? 'Could not void invoice'
    window.alert(msg)
  }
  finally {
    voidBusyId.value = ''
  }
}
</script>

<template>
  <section v-if="!canRead" class="page active">
    <div class="empty">You do not have permission to view invoices.</div>
  </section>

  <section v-else class="page active">
    <div class="pagehead">
      <div>
        <h2>Invoices</h2>
        <p>{{ subtitle }}</p>
      </div>
      <div class="actions">
        <button type="button" class="btn" disabled title="Coming soon">Export CSV</button>
        <NuxtLink v-if="canCreate" to="/invoices/new" class="btn primary">+ New Invoice</NuxtLink>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="t">Outstanding</div>
        <div class="v">{{ moneyDisplay(stats?.outstandingTotal) }}</div>
        <div class="d flat">{{ stats?.outstandingCount ?? 0 }} open invoice{{ (stats?.outstandingCount ?? 0) === 1 ? '' : 's' }}</div>
      </div>
      <div class="kpi">
        <div class="t">Paid this month</div>
        <div class="v">{{ moneyDisplay(stats?.paidThisMonthTotal) }}</div>
        <div class="d up">Payments received</div>
      </div>
      <div class="kpi">
        <div class="t">Overdue</div>
        <div class="v">{{ moneyDisplay(stats?.overdueTotal) }}</div>
        <div class="d down">{{ stats?.overdueCount ?? 0 }} past due</div>
      </div>
      <div class="kpi">
        <div class="t">Drafts</div>
        <div class="v">{{ stats?.draftCount ?? 0 }}</div>
        <div class="d flat">Awaiting finalize</div>
      </div>
    </div>

    <div class="card">
      <div class="chead">
        <button
          v-for="chip in chips"
          :key="chip.key"
          type="button"
          class="chip"
          :class="{ on: statusChip === chip.key }"
          @click="statusChip = chip.key"
        >
          {{ chip.label }} · {{ chip.count }}
        </button>
        <div class="right">
          <div class="search" style="width:220px; height:32px;">
            <span class="gl">⌕</span>
            <input
              v-model="q"
              type="search"
              placeholder="Search invoices, customers…"
              aria-label="Search invoices"
            >
          </div>
        </div>
      </div>

      <div class="tscroll">
        <table v-if="items.length" class="tbl inv-tbl">
          <thead>
            <tr>
              <th class="col-inv">Invoice</th>
              <th class="col-cust">Customer / Vehicle</th>
              <th class="col-issued">Issued</th>
              <th class="col-due">Due</th>
              <th class="col-status">Status</th>
              <th class="num col-amt">Amount</th>
              <th v-if="canVoidInvoice || canRequestDeletion" class="col-act">Actions</th>
            </tr>
          </thead>
          <tbody id="inv-rows">
            <tr
              v-for="row in items"
              :key="row.id"
              class="click"
              @click="openInvoice(row.id)"
            >
              <td class="col-inv"><span class="lead">{{ row.invoiceNumberFormatted }}</span></td>
              <td class="col-cust">
                {{ row.customerName }}
                <span class="sub">{{ vehicleSnapshotSub(row.vehicleSnapshot) }}</span>
              </td>
              <td class="col-issued">{{ invoiceDateDisplay(row.invoiceDate) }}</td>
              <td class="col-due">{{ invoiceDateDisplay(row.dueDate) }}</td>
              <td class="col-status">
                <span :class="invoiceStatusPill(row.status, row.dueDate, row.balanceDue).cls">
                  {{ invoiceStatusPill(row.status, row.dueDate, row.balanceDue).label }}
                </span>
              </td>
              <td class="num col-amt">{{ moneyDisplay(row.total) }}</td>
              <td v-if="canVoidInvoice || canRequestDeletion" class="col-act" @click.stop>
                <button
                  v-if="canVoidInvoice && removableRow(row)"
                  type="button"
                  class="btn sm danger"
                  :disabled="voidBusyId === row.id"
                  @click="voidInvoiceRow(row, $event)"
                >
                  Void
                </button>
                <NuxtLink
                  v-else-if="canRequestDeletion && removableRow(row)"
                  :to="`/invoices/${row.id}/edit`"
                  class="btn sm"
                >
                  Request deletion
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else id="inv-rows-empty" class="empty">No invoices match your search.</div>
      </div>

      <div class="cfoot">
        <span>{{ rangeLabel }}</span>
        <div v-if="pageCount > 1" class="pager">
          <button type="button" aria-label="Previous page" :disabled="page <= 1" @click="page--">‹</button>
          <button
            v-for="p in pageCount"
            :key="p"
            type="button"
            :class="{ on: p === page }"
            @click="page = p"
          >
            {{ p }}
          </button>
          <button type="button" aria-label="Next page" :disabled="page >= pageCount" @click="page++">›</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chead {
  flex-wrap: wrap;
  gap: 8px;
}
.chead .right {
  margin-left: auto;
}

/* Mobile: single-line rows — hide issued/due, truncate customer */
@media (max-width: 720px) {
  .inv-tbl .col-issued,
  .inv-tbl .col-due {
    display: none;
  }
  .inv-tbl {
    display: table;
    table-layout: fixed;
    width: 100%;
  }
  .inv-tbl .col-inv {
    width: 28%;
  }
  .inv-tbl .col-cust {
    width: 34%;
    max-width: 0;
  }
  .inv-tbl .col-cust {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .inv-tbl .col-cust .sub {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .inv-tbl .col-status {
    width: 18%;
  }
  .inv-tbl .col-amt {
    width: 20%;
  }
}
</style>
