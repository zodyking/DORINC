<script setup lang="ts">
// Invoice editor — catalog picker, line editor, server totals, editing session lock (mockup: PAGE: INVOICE EDITOR / P1-24).
import {
  autosavedLabel,
  catalogItemSub,
  catalogTypeToLineType,
  customerTermsHelp,
  editorSummaryRows,
  formatHistoryChange,
} from '~/utils/invoice-editor-ui'
import { dueDateFromTerms, LINE_TYPE_OPTIONS, previewLineAmount, previewLinesSubtotal } from '~/utils/invoice-creator-ui'
import {
  auditWhenDisplay,
  invoiceDateDisplay,
  invoiceStatusPill,
  moneyDisplay,
  type InvoiceLineType,
} from '~/utils/invoices-ui'
import { logNumberDisplay } from '~/utils/service-logs-ui'
import { odoDisplay, vehicleSub, vehicleTag, type VehicleDisplay } from '~/utils/vehicles-ui'

definePageMeta({ layout: 'staff' })

interface LineItem {
  id: string
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  lineAmount: string
}

interface InvoicePayload {
  id: string
  invoiceNumberFormatted: string
  status: string
  customerId: string
  vehicleId: string | null
  serviceLogId: string | null
  customerName: string
  customerSnapshot: { paymentTerms: string, taxExempt: boolean }
  vehicleSnapshot: (VehicleDisplay & { vin?: string | null, odometer?: string | null, odometerUnit?: string }) | null
  invoiceDate: string
  dueDate: string | null
  paymentTerms: string
  poNumber: string | null
  complaint: string | null
  internalNotes: string | null
  subtotal: string
  taxAmount: string
  taxExempt: boolean
  feesAmount: string
  shopSuppliesPercent: string | null
  discountAmount: string
  total: string
  lineItems: LineItem[]
}

interface HistoryRow {
  id: string
  action: string
  actorName: string | null
  afterData: Record<string, unknown> | null
  createdAt: string
}

interface CatalogRow {
  id: string
  itemType: string
  sku: string | null
  name: string
  defaultPrice: string | null
  uom: string
}

interface VehiclePick extends VehicleDisplay {
  id: string
  vin: string | null
  odometer: string | null
  odometerUnit: string
}

const route = useRoute()
const auth = useAuthStore()
const id = route.params.id as string

const {
  lockedByOther,
  loading: sessionLoading,
  canEdit,
  error: sessionError,
} = useEditingSession('invoice', id)

const { data, refresh, error } = await useFetch<{ invoice: InvoicePayload, history: HistoryRow[] }>(
  `/api/invoices/${id}`,
)

const invoice = computed(() => data.value?.invoice)
const history = computed(() => data.value?.history ?? [])
const isDraft = computed(() => invoice.value?.status === 'draft')

const activeTab = ref<'invoice' | 'servicelog'>('invoice')

const vehicleId = ref('')
const invoiceDate = ref('')
const dueDate = ref('')
const paymentTerms = ref('net_30')
const poNumber = ref('')
const complaint = ref('')
const internalNotes = ref('')
const lines = ref<LineItem[]>([])

const catalogQ = ref('')
const busy = ref(false)
const saveError = ref('')
const lastSavedAt = ref<Date | null>(null)
const autosaveTick = ref(0)

const canUpdate = computed(() => auth.can('invoices.update.all'))
const canDescribe = computed(() => auth.can('ai.describe.all'))
const canApprove = computed(() => auth.can('invoices.approve.all'))
const canSend = computed(() => auth.can('invoices.send.all'))
const canVoidInvoice = computed(() =>
  auth.can('invoices.void.all') && auth.can('deletion_requests.review.all'),
)
const canRequestDeletion = computed(() =>
  auth.can('deletion_requests.submit.all') && !canVoidInvoice.value,
)
const removableInvoice = computed(() =>
  invoice.value && invoice.value.status !== 'void' && invoice.value.status !== 'paid',
)
const editable = computed(() => canUpdate.value && canEdit.value && isDraft.value)

const pill = computed(() => {
  if (!invoice.value) return { cls: 'pill gray', label: '—' }
  return invoiceStatusPill(invoice.value.status as 'draft', invoice.value.dueDate, '0')
})

const summaryRows = computed(() => {
  if (!invoice.value) return []
  const liveSubtotal = previewLinesSubtotal(lines.value.map(line => ({
    localId: line.id,
    lineType: line.lineType,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
  })))
  if (liveSubtotal === invoice.value.subtotal) {
    return editorSummaryRows(invoice.value)
  }
  return editorSummaryRows({
    ...invoice.value,
    subtotal: liveSubtotal,
    total: liveSubtotal,
  })
})

const autosaveText = computed(() => {
  void autosaveTick.value
  return autosavedLabel(lastSavedAt.value)
})

const { data: vehiclesData } = await useFetch<{ items: VehiclePick[] }>(
  '/api/vehicles',
  { query: computed(() => ({ customerId: invoice.value?.customerId, pageSize: 100 })), watch: [invoice] },
)

const vehicleOptions = computed(() => vehiclesData.value?.items ?? [])

const selectedVehicle = computed(() =>
  vehicleOptions.value.find(v => v.id === vehicleId.value) ?? null,
)

const vehicleHelp = computed(() => {
  const snap = invoice.value?.vehicleSnapshot
  if (selectedVehicle.value) {
    const parts: string[] = []
    if (selectedVehicle.value.vin) parts.push(`VIN ${selectedVehicle.value.vin}`)
    if (selectedVehicle.value.odometer) {
      parts.push(odoDisplay(selectedVehicle.value.odometer, selectedVehicle.value.odometerUnit))
    }
    return parts.join(' · ') || vehicleSub(selectedVehicle.value)
  }
  if (snap) return vehicleSub(snap)
  return 'Select a vehicle for this invoice'
})

const { data: catalogData } = await useFetch<{ items: CatalogRow[] }>(
  '/api/catalog/items',
  { query: computed(() => ({ q: catalogQ.value || undefined, pageSize: 8, sort: 'name-asc' })) },
)

const catalogItems = computed(() => catalogData.value?.items ?? [])

const serviceLogId = computed(() => invoice.value?.serviceLogId ?? null)

const { data: serviceLogData } = await useFetch<{
  log: {
    id: string
    logNumber: number
    complaint: string | null
    internalNotes: string | null
    serviceDate: string
    workType: string | null
    status: string
    submitterName: string | null
    createdAt: string
    vehicle: VehicleDisplay
  }
  files: { id: string }[]
}>(
  () => (serviceLogId.value ? `/api/service-logs/${serviceLogId.value}` : null),
  { watch: [serviceLogId] },
)

watch(invoice, (inv) => {
  if (!inv) return
  vehicleId.value = inv.vehicleId ?? ''
  invoiceDate.value = inv.invoiceDate
  dueDate.value = inv.dueDate ?? dueDateFromTerms(inv.invoiceDate, inv.paymentTerms)
  paymentTerms.value = inv.paymentTerms
  poNumber.value = inv.poNumber ?? ''
  complaint.value = inv.complaint ?? ''
  internalNotes.value = inv.internalNotes ?? ''
  lines.value = inv.lineItems.map(l => ({ ...l }))
}, { immediate: true })

watch(paymentTerms, (terms) => {
  if (editable.value) dueDate.value = dueDateFromTerms(invoiceDate.value, terms)
})

if (import.meta.client) {
  const tick = setInterval(() => { autosaveTick.value += 1 }, 5000)
  onBeforeUnmount(() => clearInterval(tick))
}

async function refreshInvoice() {
  await refresh()
  lastSavedAt.value = new Date()
}

async function patchHeader() {
  if (!editable.value || !invoice.value) return
  busy.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/invoices/${id}`, {
      method: 'PATCH',
      body: {
        vehicleId: vehicleId.value || null,
        invoiceDate: invoiceDate.value,
        dueDate: dueDate.value || null,
        paymentTerms: paymentTerms.value,
        poNumber: poNumber.value || null,
        complaint: complaint.value || null,
        internalNotes: internalNotes.value || null,
      },
    })
    await refreshInvoice()
  }
  catch (e: unknown) {
    saveError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    busy.value = false
  }
}

async function patchLine(line: LineItem) {
  if (!editable.value || !line.description.trim()) return
  busy.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/invoices/${id}/line-items/${line.id}`, {
      method: 'PATCH',
      body: {
        lineType: line.lineType,
        description: line.description.trim(),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      },
    })
    await refreshInvoice()
  }
  catch (e: unknown) {
    saveError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Line update failed'
  }
  finally {
    busy.value = false
  }
}

async function addEmptyLine() {
  if (!editable.value) return
  busy.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/invoices/${id}/line-items`, {
      method: 'POST',
      body: {
        lineType: 'labor',
        description: 'New line item',
        quantity: '1',
        unitPrice: '0',
        sortOrder: lines.value.length,
      },
    })
    await refreshInvoice()
  }
  catch (e: unknown) {
    saveError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not add line'
  }
  finally {
    busy.value = false
  }
}

async function addFromCatalog(item: CatalogRow) {
  if (!editable.value) return
  busy.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/invoices/${id}/line-items`, {
      method: 'POST',
      body: {
        lineType: catalogTypeToLineType(item.itemType),
        catalogItemId: item.id,
        description: item.name,
        quantity: '1',
        unitPrice: item.defaultPrice ?? '0',
        sortOrder: lines.value.length,
      },
    })
    await refreshInvoice()
  }
  catch (e: unknown) {
    saveError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not add catalog item'
  }
  finally {
    busy.value = false
  }
}

async function removeLine(lineId: string) {
  if (!editable.value || lines.value.length <= 1) return
  busy.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/invoices/${id}/line-items/${lineId}`, { method: 'DELETE' })
    await refreshInvoice()
  }
  catch (e: unknown) {
    saveError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not remove line'
  }
  finally {
    busy.value = false
  }
}

async function finalizeAndSend() {
  if (!editable.value) return
  busy.value = true
  saveError.value = ''
  try {
    await patchHeader()
    if (canApprove.value) await $fetch(`/api/invoices/${id}/approve`, { method: 'POST' })
    if (canSend.value) {
      const sendResult = await $fetch<{ message?: string }>(`/api/invoices/${id}/send`, { method: 'POST' })
      saveError.value = sendResult.message ?? 'Invoice queued for email delivery.'
    }
    await navigateTo(`/invoices/${id}`)
  }
  catch (e: unknown) {
    saveError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Finalize failed'
  }
  finally {
    busy.value = false
  }
}

function copyComplaintFromLog() {
  const log = serviceLogData.value?.log
  if (!log || !editable.value) return
  complaint.value = log.complaint ?? ''
  internalNotes.value = log.internalNotes ?? ''
  void patchHeader()
}

interface AiSuggestionRow {
  id: string
  status: string
  featureType: string
  originalContent: Record<string, unknown> | null
  suggestedContent: Record<string, unknown>
}

const selectedLineId = ref<string | null>(null)
const aiPopOpen = ref(false)
const aiPopText = ref('')
const aiPopOriginal = ref('')
const aiPopSuggestionId = ref<string | null>(null)
const aiBusy = ref(false)
const aiError = ref('')
const aiPopAnchor = ref<{ x: number, y: number } | null>(null)

const { data: invoiceAiData, refresh: refreshInvoiceAi } = await useFetch<{ suggestions: AiSuggestionRow[] }>(
  `/api/invoices/${id}/ai-suggestions`,
)

const invoiceAiSuggestions = computed(() => invoiceAiData.value?.suggestions ?? [])

const selectedLine = computed(() =>
  lines.value.find(l => l.id === selectedLineId.value) ?? null,
)

let aiPollTimer: ReturnType<typeof setInterval> | null = null

function stopAiPoll() {
  if (aiPollTimer) {
    clearInterval(aiPollTimer)
    aiPollTimer = null
  }
}

function startAiPoll(lineId: string) {
  stopAiPoll()
  aiPollTimer = setInterval(async () => {
    await refreshInvoiceAi()
    const pending = invoiceAiSuggestions.value.find((s) => {
      if (s.status !== 'pending') return false
      const lid = s.originalContent?.lineItemId ?? s.suggestedContent.lineItemId
      return lid === lineId
    })
    if (pending) {
      aiPopSuggestionId.value = pending.id
      aiPopText.value = String(pending.suggestedContent.description ?? '')
      aiPopOriginal.value = String(pending.originalContent?.description ?? selectedLine.value?.description ?? '')
      stopAiPoll()
    }
  }, 2000)
}

onBeforeUnmount(() => stopAiPoll())

function positionAiPop(event: MouseEvent) {
  aiPopAnchor.value = { x: event.clientX, y: event.clientY + 8 }
}

async function openAiPopover(line: LineItem, event: MouseEvent) {
  if (!editable.value || !canDescribe.value) return
  selectedLineId.value = line.id
  aiPopOriginal.value = line.description
  aiPopText.value = ''
  aiPopSuggestionId.value = null
  aiError.value = ''
  aiPopOpen.value = true
  positionAiPop(event)
  aiBusy.value = true
  try {
    await $fetch(`/api/invoices/${id}/line-items/${line.id}/ai-describe`, { method: 'POST' })
    startAiPoll(line.id)
    await refreshInvoiceAi()
    const pending = invoiceAiSuggestions.value.find((s) => {
      if (s.status !== 'pending') return false
      const lid = s.originalContent?.lineItemId ?? s.suggestedContent.lineItemId
      return lid === line.id
    })
    if (pending) {
      aiPopSuggestionId.value = pending.id
      aiPopText.value = String(pending.suggestedContent.description ?? '')
    }
  }
  catch (e: unknown) {
    aiError.value = (e as { data?: { message?: string } })?.data?.message ?? 'AI assist unavailable — edit manually'
  }
  finally {
    aiBusy.value = false
  }
}

async function insertAiDescription() {
  if (!aiPopSuggestionId.value || !selectedLineId.value) return
  aiBusy.value = true
  aiError.value = ''
  try {
    await $fetch(`/api/ai/suggestions/${aiPopSuggestionId.value}/review`, {
      method: 'POST',
      body: {
        action: 'edit',
        lineItemId: selectedLineId.value,
        content: {
          description: aiPopText.value.trim(),
          lineItemId: selectedLineId.value,
          originalDescription: aiPopOriginal.value,
        },
      },
    })
    aiPopOpen.value = false
    await Promise.all([refreshInvoice(), refreshInvoiceAi()])
  }
  catch (e: unknown) {
    aiError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not apply description'
  }
  finally {
    aiBusy.value = false
  }
}

async function regenerateAiDescription() {
  const line = selectedLine.value
  if (!line) return
  const oldSuggestionId = aiPopSuggestionId.value
  aiPopSuggestionId.value = null
  aiPopText.value = ''
  aiBusy.value = true
  aiError.value = ''
  try {
    if (oldSuggestionId) {
      await $fetch(`/api/ai/suggestions/${oldSuggestionId}/review`, {
        method: 'POST',
        body: { action: 'reject' },
      })
    }
    await $fetch(`/api/invoices/${id}/line-items/${line.id}/ai-describe`, { method: 'POST' })
    startAiPoll(line.id)
    await refreshInvoiceAi()
  }
  catch (e: unknown) {
    aiError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Regenerate failed'
  }
  finally {
    aiBusy.value = false
  }
}

async function dismissAiPopover() {
  if (aiPopSuggestionId.value) {
    try {
      await $fetch(`/api/ai/suggestions/${aiPopSuggestionId.value}/review`, {
        method: 'POST',
        body: { action: 'reject' },
      })
      await refreshInvoiceAi()
    }
    catch { /* dismiss anyway */ }
  }
  stopAiPoll()
  aiPopOpen.value = false
}

function onAiKeydown(e: KeyboardEvent) {
  if (!editable.value || !canDescribe.value) return
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    const line = selectedLine.value ?? lines.value[0]
    if (line) {
      selectedLineId.value = line.id
      void openAiPopover(line, { clientX: window.innerWidth / 2, clientY: 120 } as MouseEvent)
    }
  }
}

if (import.meta.client) {
  window.addEventListener('keydown', onAiKeydown)
  onBeforeUnmount(() => window.removeEventListener('keydown', onAiKeydown))
}

const aiPopStyle = computed(() => {
  if (!import.meta.client || !aiPopAnchor.value) return {}
  return {
    left: `${Math.min(aiPopAnchor.value.x, window.innerWidth - 400)}px`,
    top: `${Math.min(aiPopAnchor.value.y, window.innerHeight - 280)}px`,
  }
})
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:24px;">
      <p>Invoice not found.</p>
      <NuxtLink to="/invoices" class="btn">Back to invoices</NuxtLink>
    </div>

    <template v-else-if="invoice">
      <div class="pagehead">
        <div>
          <h2>
            Invoice Editor
            <span :class="pill.cls" style="vertical-align:3px">{{ pill.label }} · {{ invoice.invoiceNumberFormatted }}</span>
          </h2>
          <p>
            <NuxtLink to="/invoices">Invoices</NuxtLink>
            / <NuxtLink :to="`/invoices/${id}`">{{ invoice.invoiceNumberFormatted }}</NuxtLink>
            · {{ autosaveText }}
          </p>
        </div>
        <div class="actions">
          <NuxtLink to="/templates/designer" class="btn">Template designer</NuxtLink>
          <button type="button" class="btn" disabled title="Coming soon">Preview PDF</button>
          <RequestDeletionButton
            v-if="removableInvoice && canRequestDeletion"
            entity-type="invoice"
            :entity-id="id"
            :entity-label="invoice.invoiceNumberFormatted"
            :disabled="busy"
            @submitted="refresh()"
          />
          <VoidInvoiceButton
            v-if="removableInvoice && canVoidInvoice"
            :invoice-id="id"
            :invoice-label="invoice.invoiceNumberFormatted"
            :status="invoice.status"
            :disabled="busy"
            @voided="refresh()"
          />
        </div>
      </div>

      <div
        v-if="lockedByOther"
        class="edit-lock-banner"
      >
        <div>
          <b>{{ lockedByOther.userName }}</b> is editing this invoice — you have read-only access until they finish.
        </div>
      </div>

      <div v-else-if="sessionLoading" class="help" style="margin:-8px 0 16px;">Loading editor…</div>
      <div v-else-if="sessionError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ sessionError }}</div>

      <div v-if="!isDraft" class="card" style="margin-bottom:16px;">
        <div class="cbody">
          This invoice is {{ invoice.status }} and cannot be edited.
          <NuxtLink :to="`/invoices/${id}`" class="btn sm" style="margin-left:8px;">View detail</NuxtLink>
        </div>
      </div>

      <p v-if="saveError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ saveError }}</p>

      <div v-if="invoice.serviceLogId" class="ed-tabs-wrap">
        <div class="ed-tabs" role="tablist" aria-label="Invoice editor views">
          <button
            type="button"
            class="ed-tab"
            :class="{ on: activeTab === 'invoice' }"
            role="tab"
            :aria-selected="activeTab === 'invoice'"
            @click="activeTab = 'invoice'"
          >
            Invoice
          </button>
          <button
            type="button"
            class="ed-tab"
            :class="{ on: activeTab === 'servicelog' }"
            role="tab"
            :aria-selected="activeTab === 'servicelog'"
            @click="activeTab = 'servicelog'"
          >
            Service log
            <span v-if="serviceLogData?.log" class="ed-tab-pill">{{ logNumberDisplay(serviceLogData?.log?.logNumber ?? 0) }}</span>
          </button>
        </div>
        <p class="ed-tab-hint">Mechanic photos and field notes attach to this invoice — switch tabs to reference while building line items.</p>
      </div>

      <div v-show="activeTab === 'invoice'" class="ed-pane active">
        <div class="cols">
          <div class="stack">
            <div class="card">
              <div class="chead"><h3>Details</h3></div>
              <div class="cbody ed-details-grid">
                <label class="fld">
                  Customer
                  <input type="text" :value="invoice.customerName" disabled>
                  <span class="help">{{ customerTermsHelp(invoice.paymentTerms) }}</span>
                </label>
                <label class="fld">
                  Vehicle
                  <select v-model="vehicleId" :disabled="!editable" @change="patchHeader">
                    <option value="">— Select vehicle —</option>
                    <option v-for="v in vehicleOptions" :key="v.id" :value="v.id">
                      {{ vehicleTag(v) }} — {{ vehicleSub(v) }}
                    </option>
                  </select>
                  <span class="help">{{ vehicleHelp }}</span>
                </label>
                <label class="fld">
                  Issue date
                  <input v-model="invoiceDate" type="date" :disabled="!editable" @change="patchHeader">
                </label>
                <label class="fld">
                  Due date
                  <input v-model="dueDate" type="date" :disabled="!editable" @change="patchHeader">
                </label>
                <label class="fld ed-po-span">
                  Reference / PO
                  <input v-model="poNumber" type="text" placeholder="Optional — customer PO number" :disabled="!editable" @blur="patchHeader">
                </label>
              </div>
            </div>

            <div class="card">
              <div class="chead"><h3>Service narrative</h3></div>
              <div class="cbody">
                <label class="fld">
                  Customer complaint / symptoms
                  <textarea
                    v-model="complaint"
                    rows="4"
                    placeholder="What the customer reported — printed on invoice PDF"
                    :disabled="!editable"
                    @blur="patchHeader"
                  />
                  <span class="help">Shown on customer-facing PDF under Symptoms / Complaints</span>
                </label>
                <label class="fld">
                  Internal notes <span class="fld-badge">Staff only</span>
                  <textarea
                    v-model="internalNotes"
                    rows="4"
                    placeholder="Parts used, fault codes, follow-up — staff only"
                    :disabled="!editable"
                    @blur="patchHeader"
                  />
                  <span class="help">Never shown on customer PDF or portal</span>
                </label>
              </div>
            </div>

            <div class="card">
              <div class="chead">
                <h3>Line items</h3>
                <div class="right">
                  <button
                    type="button"
                    class="btn sm ai-btn"
                    :disabled="!editable || !canDescribe || aiBusy || !lines.length"
                    title="AI description assist (Ctrl+Shift+D)"
                    @click="openAiPopover(lines.find(l => l.id === selectedLineId) ?? lines[0]!, $event)"
                  >
                    <span class="dot">✦</span> AI
                  </button>
                  <NuxtLink to="/catalog" class="btn sm">From catalog</NuxtLink>
                  <button type="button" class="btn sm primary" :disabled="!editable || busy" @click="addEmptyLine">+ Add line</button>
                </div>
              </div>
              <div class="tscroll">
                <table class="ed-lines">
                  <thead>
                    <tr>
                      <th style="width:110px">Type</th>
                      <th>Description</th>
                      <th style="width:90px">Qty / Hrs</th>
                      <th style="width:110px">Rate</th>
                      <th style="width:110px; text-align:right">Amount</th>
                      <th style="width:36px" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="line in lines" :key="line.id">
                      <td>
                        <select v-model="line.lineType" :disabled="!editable" @change="patchLine(line)">
                          <option v-for="opt in LINE_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                        </select>
                      </td>
                      <td>
                        <input
                          v-model="line.description"
                          type="text"
                          :disabled="!editable"
                          @focus="selectedLineId = line.id"
                          @blur="patchLine(line)"
                        >
                      </td>
                      <td>
                        <input v-model="line.quantity" class="num" type="number" step="0.25" min="0" :disabled="!editable" @blur="patchLine(line)">
                      </td>
                      <td>
                        <input v-model="line.unitPrice" class="num" type="number" step="0.01" min="0" :disabled="!editable" @blur="patchLine(line)">
                      </td>
                      <td class="amt">{{ moneyDisplay(previewLineAmount(line.quantity, line.unitPrice) || line.lineAmount) }}</td>
                      <td>
                        <button
                          type="button"
                          class="rm"
                          aria-label="Remove line"
                          :disabled="!editable || lines.length <= 1 || busy"
                          @click="removeLine(line.id)"
                        >
                          ✕
                        </button>
                      </td>
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

            <div v-if="editable" class="savebar">
              <button type="button" class="btn" :disabled="busy" @click="patchHeader">Save draft</button>
              <NuxtLink :to="`/invoices/${id}`" class="btn danger">Discard</NuxtLink>
              <button
                type="button"
                class="btn primary"
                :disabled="busy"
                :title="!canApprove || !canSend ? 'Requires approve and send permissions' : undefined"
                @click="finalizeAndSend"
              >
                Finalize &amp; send
              </button>
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="chead"><h3>Quick add from catalog</h3></div>
              <div class="cbody" style="padding:10px 12px;">
                <div class="search" style="max-width:none; margin-bottom:8px;">
                  <span class="gl">⌕</span>
                  <input v-model="catalogQ" type="search" placeholder="Search catalog items…" aria-label="Search catalog items">
                </div>
                <div v-if="catalogItems.length">
                  <div v-for="item in catalogItems" :key="item.id" class="qitem" style="padding:10px 6px;">
                    <div class="info">
                      <b>{{ item.name }}</b>
                      <div class="sub">{{ catalogItemSub(item) }}</div>
                    </div>
                    <div class="qa">
                      <button type="button" class="btn sm" :disabled="!editable || busy" @click="addFromCatalog(item)">Add</button>
                    </div>
                  </div>
                </div>
                <div v-else class="empty" style="padding:16px 6px;">No catalog items found.</div>
              </div>
            </div>

            <div class="card">
              <div class="chead"><h3>PDF output</h3></div>
              <dl class="kv">
                <dt>Paper</dt><dd>Letter · 0.5in margins</dd>
                <dt>Delivery</dt><dd>Portal + email</dd>
              </dl>
            </div>

            <div class="card">
              <div class="chead">
                <h3>Change history</h3>
              </div>
              <div class="tscroll">
                <table class="tbl hist-log">
                  <thead>
                    <tr><th>When</th><th>User</th><th>Change</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in history" :key="row.id">
                      <td class="when">{{ auditWhenDisplay(row.createdAt) }}</td>
                      <td class="who">{{ row.actorName ?? '—' }}</td>
                      <td class="chg">{{ formatHistoryChange(row.action, row.afterData) }}</td>
                    </tr>
                    <tr v-if="!history.length">
                      <td colspan="3" class="empty" style="display:table-cell;">No history yet.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'servicelog' && serviceLogData?.log" class="ed-pane">
        <div class="cols">
          <div class="stack">
            <div class="card">
              <div class="chead">
                <h3>Uploaded files · {{ serviceLogData?.files?.length ?? 0 }}</h3>
                <div class="right"><span class="pill info">From mechanic</span></div>
              </div>
              <div class="cbody">
                <div class="photos ed-log-photos">
                  <div v-for="f in (serviceLogData?.files ?? []).slice(0, 8)" :key="f.id" class="photo">🖼</div>
                </div>
                <p class="help" style="margin-top:12px;">Tap to enlarge</p>
              </div>
            </div>
            <div class="card">
              <div class="chead"><h3>Customer complaint / symptoms</h3></div>
              <div class="cbody ed-log-readonly">{{ serviceLogData?.log?.complaint || '—' }}</div>
            </div>
            <div class="card">
              <div class="chead"><h3>Internal notes <span class="fld-badge">Staff only</span></h3></div>
              <div class="cbody ed-log-readonly">{{ serviceLogData?.log?.internalNotes || '—' }}</div>
            </div>
          </div>
          <div class="stack">
            <div class="card">
              <div class="chead"><h3>Log metadata</h3></div>
              <dl class="kv">
                <dt>Service log</dt><dd>{{ logNumberDisplay(serviceLogData?.log?.logNumber ?? 0) }}</dd>
                <dt>Submitted by</dt><dd>{{ serviceLogData?.log?.submitterName ?? '—' }}</dd>
                <dt>Uploaded</dt><dd>{{ serviceLogData?.log?.createdAt ? invoiceDateDisplay(serviceLogData.log.createdAt.slice(0, 10)) : '—' }}</dd>
                <dt>Service date</dt><dd>{{ serviceLogData?.log?.serviceDate ? invoiceDateDisplay(serviceLogData.log.serviceDate) : '—' }}</dd>
                <dt>Vehicle</dt><dd>{{ serviceLogData?.log?.vehicle ? `${vehicleTag(serviceLogData.log.vehicle)} · ${vehicleSub(serviceLogData.log.vehicle)}` : '—' }}</dd>
                <dt>Work type</dt><dd>{{ serviceLogData?.log?.workType ?? '—' }}</dd>
              </dl>
            </div>
            <div class="card">
              <div class="chead"><h3>Draft line items from log</h3></div>
              <div class="cbody" style="padding-top:0; display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn sm" :disabled="!editable" @click="copyComplaintFromLog">Copy notes to invoice</button>
                <NuxtLink
                  v-if="invoice.serviceLogId"
                  :to="`/service-logs/${invoice.serviceLogId}`"
                  class="btn sm"
                >
                  Open full log →
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="aiPopOpen"
        class="ai-pop open"
        role="dialog"
        aria-label="AI description assist"
        :style="aiPopStyle"
      >
        <div class="ph">
          <b>✦ Description assist</b>
          <kbd>Ctrl+Shift+D</kbd>
        </div>
        <p v-if="aiPopOriginal" class="help" style="margin:0 0 8px;">
          Original: <span style="color:#64748b;">{{ aiPopOriginal }}</span>
        </p>
        <p v-if="aiError" class="help" style="color:#dc2626; margin:0 0 8px;">{{ aiError }}</p>
        <div v-if="aiBusy && !aiPopText" class="body">Generating customer-facing wording…</div>
        <textarea
          v-else
          v-model="aiPopText"
          class="body"
          rows="5"
          style="width:100%; resize:vertical; font:inherit;"
          placeholder="AI suggestion appears here — edit before inserting"
        />
        <div class="acts">
          <button type="button" class="btn sm primary" :disabled="aiBusy || !aiPopText.trim()" @click="insertAiDescription">
            Insert into selected line
          </button>
          <button type="button" class="btn sm" :disabled="aiBusy" @click="regenerateAiDescription">
            Regenerate
          </button>
          <button type="button" class="btn sm" @click="dismissAiPopover">
            Dismiss
          </button>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.ed-details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 18px;
}
.ed-po-span {
  grid-column: 1 / -1;
}
@media (max-width: 640px) {
  .ed-details-grid {
    grid-template-columns: 1fr;
  }
}
</style>
