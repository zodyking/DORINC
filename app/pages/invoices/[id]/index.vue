<script setup lang="ts">
// Invoice detail — line items, API totals, status actions, PDF placeholder (mockup: PAGE: INVOICE DETAIL).
import type { InvoiceVehicleSnapshotDisplay } from '~/utils/invoices-ui'

definePageMeta({ layout: 'staff' })

interface CatalogSnapshotBits {
  description: string | null
}

interface CustomerSnapshotBits {
  email: string | null
  phone: string | null
}

interface LineItem {
  id: string
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  lineAmount: string
  catalogSnapshot: CatalogSnapshotBits | null
}

interface Invoice {
  id: string
  invoiceNumberFormatted: string
  status: InvoiceStatus
  invoiceDate: string
  dueDate: string | null
  paymentTerms: string
  poNumber: string | null
  customerId: string
  vehicleId: string | null
  customerName: string
  customerSnapshot: CustomerSnapshotBits
  vehicleSnapshot: InvoiceVehicleSnapshotDisplay | null
  subtotal: string
  taxAmount: string
  taxExempt: boolean
  discountAmount: string
  feesAmount: string
  shopSuppliesPercent: string | null
  total: string
  amountPaid: string
  balanceDue: string
  lineItems: LineItem[]
}

interface HistoryRow {
  id: string
  action: string
  actorName: string | null
  changedFields: string[] | null
  afterData: Record<string, unknown> | null
  createdAt: string
}

const route = useRoute()
const auth = useAuthStore()
const id = route.params.id as string

const {
  activeEditor,
  loading: sessionLoading,
  canAdminRelease,
  isSelfEditing,
  forceRelease,
  forceReleaseBusy,
  forceReleaseError,
} = useEditingSessionStatus('invoice', id)

const { data, refresh, error } = await useFetch<{
  invoice: Invoice
  history: HistoryRow[]
}>(`/api/invoices/${id}`)

const invoice = computed(() => data.value?.invoice)
const history = computed(() => data.value?.history ?? [])
const lines = computed(() => invoice.value?.lineItems ?? [])

const canRead = computed(() => auth.can('invoices.read.all'))
const canUpdate = computed(() => auth.can('invoices.update.all'))
const canApprove = computed(() => auth.can('invoices.approve.all'))
const canManagerApprove = computed(() =>
  ['manager', 'admin', 'super_admin'].includes(auth.user?.accountType ?? ''),
)
const canSend = computed(() => auth.can('invoices.send.all'))
const canRecordPayment = computed(() => auth.can('invoices.record_payment.all'))
const canGeneratePdf = computed(() => auth.can('invoices.generate_pdf.all'))

const pill = computed(() => {
  if (!invoice.value) return { cls: 'pill gray', label: '—' }
  return invoiceStatusPill(invoice.value.status, invoice.value.dueDate, invoice.value.balanceDue)
})

const headlineStatus = computed(() => {
  if (!invoice.value) return ''
  return invoiceStatusHeadline(invoice.value.status, invoice.value.dueDate, invoice.value.balanceDue)
})

const isDraft = computed(() => invoice.value?.status === 'draft')
const showRecordPayment = computed(() =>
  invoice.value && invoice.value.status === 'sent'
  && Number.parseFloat(invoice.value.balanceDue) > 0,
)

const busy = ref(false)
const actionError = ref('')

async function runAdminForceRelease() {
  const reason = window.prompt('Reason for force-releasing this edit lock (required):')
  if (!reason?.trim()) return
  await forceRelease(reason.trim())
}

async function runAction(path: string) {
  if (!invoice.value) return
  busy.value = true
  actionError.value = ''
  try {
    await $fetch(path, { method: 'POST' })
    await refresh()
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Action failed'
  }
  finally {
    busy.value = false
  }
}

const summaryRows = computed(() => {
  if (!invoice.value) return []
  const inv = invoice.value
  const rows: { label: string, value: string, grand?: boolean }[] = [
    { label: 'Subtotal', value: moneyDisplay(inv.subtotal) },
  ]
  if (inv.feesAmount && Number.parseFloat(inv.feesAmount) > 0) {
    rows.push({ label: 'Fees & surcharges', value: moneyDisplay(inv.feesAmount) })
  }
  if (inv.shopSuppliesPercent && Number.parseFloat(inv.shopSuppliesPercent) > 0) {
    rows.push({ label: `Shop supplies (${inv.shopSuppliesPercent}%)`, value: 'Included in fees' })
  }
  const taxLabel = inv.taxExempt ? 'Tax (exempt)' : 'Tax'
  rows.push({ label: taxLabel, value: moneyDisplay(inv.taxAmount) })
  if (inv.discountAmount && Number.parseFloat(inv.discountAmount) > 0) {
    rows.push({ label: 'Discount', value: moneyDisplay(inv.discountAmount, { signed: true }) })
  }
  if (inv.amountPaid && Number.parseFloat(inv.amountPaid) > 0) {
    rows.push({ label: 'Amount paid', value: `−${moneyDisplay(inv.amountPaid)}` })
  }
  rows.push({ label: 'Balance due', value: moneyDisplay(inv.balanceDue), grand: true })
  return rows
})
</script>

<template>
  <section v-if="!canRead" class="page active">
    <div class="empty">You do not have permission to view invoices.</div>
  </section>

  <section v-else-if="error" class="page active">
    <div class="empty">Invoice not found or you do not have access.</div>
  </section>

  <section v-else-if="invoice" class="page active">
    <div class="pagehead">
      <div>
        <h2>
          {{ invoice.invoiceNumberFormatted }}
          <span :class="pill.cls" style="vertical-align:3px">{{ headlineStatus }}</span>
        </h2>
        <p>
          <NuxtLink to="/invoices">Invoices</NuxtLink>
          / {{ invoice.invoiceNumberFormatted }} · {{ invoice.customerName }}
        </p>
      </div>
      <div class="actions">
        <button
          type="button"
          class="btn"
          disabled
          :title="canGeneratePdf ? 'PDF generation arrives in P1-29' : 'Requires generate PDF permission'"
        >
          Download PDF
        </button>
        <button
          v-if="canSend && invoice.status === 'sent'"
          type="button"
          class="btn"
          disabled
          title="Send reminder arrives with SMTP integration"
        >
          Send reminder
        </button>
        <button
          v-if="canApprove && invoice.status === 'draft'"
          type="button"
          class="btn"
          :disabled="busy"
          @click="runAction(`/api/invoices/${id}/approve`)"
        >
          Approve
        </button>
        <button
          v-if="canApprove && canManagerApprove && invoice.status === 'pending_manager_approval'"
          type="button"
          class="btn primary"
          :disabled="busy"
          @click="runAction(`/api/invoices/${id}/approve`)"
        >
          Manager approve
        </button>
        <button
          v-if="canSend && invoice.status === 'approved'"
          type="button"
          class="btn"
          :disabled="busy"
          @click="runAction(`/api/invoices/${id}/send`)"
        >
          Send invoice
        </button>
        <NuxtLink
          v-if="canUpdate && isDraft"
          :to="`/invoices/${id}/edit`"
          class="btn"
        >
          Edit
        </NuxtLink>
        <NuxtLink
          v-if="canRecordPayment && showRecordPayment"
          :to="`/invoices/${id}/payment`"
          class="btn primary"
        >
          Record payment
        </NuxtLink>
      </div>
    </div>

    <p v-if="actionError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ actionError }}</p>

    <div
      v-if="isDraft && activeEditor && !sessionLoading"
      class="edit-lock-banner"
    >
      <div>
        <template v-if="isSelfEditing">
          You have this invoice open in the editor.
        </template>
        <template v-else>
          <b>{{ activeEditor.userName }}</b> is editing this invoice — detail view is read-only until they finish.
        </template>
      </div>
      <button
        v-if="canAdminRelease && !isSelfEditing"
        type="button"
        class="btn sm"
        :disabled="forceReleaseBusy"
        @click="runAdminForceRelease"
      >
        Force release
      </button>
    </div>
    <p v-if="forceReleaseError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ forceReleaseError }}</p>

    <div class="cols">
      <div class="stack">
        <div class="card">
          <div class="chead">
            <h3>Line items · {{ lines.length }}</h3>
            <div class="right">
              <span class="pill gray">{{ paymentTermsLabel(invoice.paymentTerms) }}</span>
            </div>
          </div>
          <div class="tscroll">
            <table class="tbl inv-detail-tbl">
              <thead>
                <tr>
                  <th class="col-desc">Description</th>
                  <th class="col-qty">Qty / Hrs</th>
                  <th class="num col-rate">Rate</th>
                  <th class="num col-line">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in lines" :key="line.id">
                  <td class="col-desc">
                    <span :class="lineTypePill(line.lineType)" style="margin-right:8px">{{ lineTypeLabel(line.lineType) }}</span>
                    {{ line.description }}
                    <span v-if="line.catalogSnapshot?.description" class="sub">{{ line.catalogSnapshot.description }}</span>
                  </td>
                  <td class="col-qty">{{ lineQuantityDisplay(line.quantity, line.lineType) }}</td>
                  <td class="num col-rate">{{ moneyDisplay(line.unitPrice) }}</td>
                  <td class="num col-line">{{ moneyDisplay(line.lineAmount) }}</td>
                </tr>
                <tr v-if="!lines.length">
                  <td colspan="4" class="empty" style="display:table-cell;">No line items yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ed-sums">
            <div
              v-for="(row, i) in summaryRows"
              :key="i"
              class="row"
              :class="{ grand: row.grand }"
            >
              <span>{{ row.label }}</span>
              <span>{{ row.value }}</span>
            </div>
          </div>
        </div>

        <div v-if="Number.parseFloat(invoice.amountPaid) > 0" class="card">
          <div class="chead"><h3>Payments</h3></div>
          <div class="tscroll">
            <table class="tbl">
              <thead>
                <tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{{ invoiceDateDisplay(invoice.invoiceDate) }}</td>
                  <td>Recorded</td>
                  <td class="mono">—</td>
                  <td class="num">{{ moneyDisplay(invoice.amountPaid) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="chead">
            <h3>Customer</h3>
            <div class="right">
              <NuxtLink :to="`/customers/${invoice.customerId}`" class="btn ghost sm">View →</NuxtLink>
            </div>
          </div>
          <dl class="kv">
            <dt>Account</dt><dd>{{ invoice.customerName }}</dd>
            <dt>Email</dt><dd>{{ invoice.customerSnapshot.email ?? '—' }}</dd>
            <dt>Phone</dt><dd>{{ invoice.customerSnapshot.phone ?? '—' }}</dd>
            <dt>Terms</dt><dd>{{ paymentTermsLabel(invoice.paymentTerms) }}</dd>
            <dt>PO / ref</dt><dd>{{ invoice.poNumber ?? '—' }}</dd>
            <dt>Balance due</dt><dd>{{ moneyDisplay(invoice.balanceDue) }}</dd>
          </dl>
        </div>

        <div v-if="invoice.vehicleSnapshot" class="card">
          <div class="chead">
            <h3>Vehicle</h3>
            <div v-if="invoice.vehicleId" class="right">
              <NuxtLink :to="`/vehicles/${invoice.vehicleId}`" class="btn ghost sm">View →</NuxtLink>
            </div>
          </div>
          <dl class="kv">
            <dt>Unit</dt><dd>{{ vehicleSub(invoice.vehicleSnapshot) }}</dd>
            <dt>VIN</dt><dd class="mono" style="font-size:12px">{{ invoice.vehicleSnapshot.vin ?? '—' }}</dd>
            <dt>Odometer</dt><dd>{{ odoDisplay(invoice.vehicleSnapshot.odometer, invoice.vehicleSnapshot.odometerUnit) }}</dd>
            <dt>Fleet #</dt><dd>{{ invoice.vehicleSnapshot.busNumber ?? invoice.vehicleSnapshot.unitTag ?? '—' }}</dd>
          </dl>
        </div>

        <div class="card">
          <div class="chead">
            <h3>Change history</h3>
            <span style="font-size:12px;color:#94a3b8;">Append-only</span>
          </div>
          <div class="tscroll">
            <table class="tbl hist-log">
              <thead>
                <tr><th>When</th><th>User</th><th>Change</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in history" :key="row.id">
                  <td class="when">{{ auditWhenDisplay(row.createdAt) }}</td>
                  <td class="who">{{ row.actorName ?? 'system' }}</td>
                  <td class="chg">{{ formatInvoiceAuditAction(row.action) }}</td>
                </tr>
                <tr v-if="!history.length">
                  <td class="when">—</td>
                  <td class="who">—</td>
                  <td class="chg">No activity recorded yet</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Mobile: single-line line-item rows */
@media (max-width: 720px) {
  .inv-detail-tbl .col-rate {
    display: none;
  }
  .inv-detail-tbl {
    table-layout: fixed;
    width: 100%;
  }
  .inv-detail-tbl .col-desc {
    max-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .inv-detail-tbl .col-desc .sub {
    display: none;
  }
  .inv-detail-tbl .col-qty {
    width: 22%;
  }
  .inv-detail-tbl .col-line {
    width: 28%;
  }
}
</style>
