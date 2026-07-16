<script setup lang="ts">
// Invoice creator wizard — customer → vehicle → lines → review (mockup: PAGE: INVOICE CREATOR / P1-23).
import CatalogLineAutocomplete from '~/components/invoices/CatalogLineAutocomplete.vue'
import LineCurrencyInput from '~/components/invoices/LineCurrencyInput.vue'
import LineQuantityInput from '~/components/invoices/LineQuantityInput.vue'
import { applyCatalogItemToLineFields, editorSummaryRows, type CatalogQuickItem } from '~/utils/invoice-editor-ui'
import {
  buildInvoiceLinePatchBody,
  canProceedWizardStep,
  createEmptyLine,
  dueDateFromTerms,
  formatInvoiceNumberDisplay,
  formatQuantityField,
  formatUnitPriceField,
  INVOICE_WIZARD_STEPS,
  isDraftLineValid,
  LINE_TYPE_OPTIONS,
  previewDraftTotals,
  previewLineAmount,
  previewLineTypeBreakdown,
  type DraftLine,
} from '~/utils/invoice-creator-ui'
import {
  auditWhenDisplay,
  moneyDisplay,
  paymentTermsLabel,
} from '~/utils/invoices-ui'
import { logNumberDisplay } from '~/utils/service-logs-ui'
import { odoDisplay, vehicleSub, vehicleTag, type VehicleDisplay } from '~/utils/vehicles-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  draftLineToWizard,
  wizardLinesToDraftLines,
  applyInferredLineType,
  type WizardLineDraft,
} from '~/utils/line-item-wizard-ui'

definePageMeta({ layout: 'staff', permission: 'invoices.create.all' })

interface CustomerPick {
  id: string
  displayName: string
  accountKind: string
  paymentTerms: string
  taxExempt: boolean
}

interface VehiclePick extends VehicleDisplay {
  id: string
  vin: string | null
  odometer: string | null
  odometerUnit: string
}

interface ServiceLogPick {
  id: string
  logNumber: number
  customerId: string
  vehicleId: string
  complaint: string | null
  vehicle: VehicleDisplay
}

interface SavedInvoiceTotals {
  id: string
  invoiceNumber: number
  invoiceNumberFormatted: string
  subtotal: string
  taxAmount: string
  taxExempt: boolean
  feesAmount: string
  shopSuppliesPercent: string | null
  discountAmount: string
  total: string
  lineItems: { id: string, lineAmount: string }[]
}

const auth = useAuthStore()

const step = ref(1)
const busy = ref(false)
const pdfPreviewRef = ref<{ refresh: () => Promise<void>, refit: () => void } | null>(null)

const canGeneratePdf = computed(() => auth.can('invoices.generate_pdf.all'))

const INVOICE_NARRATIONS: Record<number, string> = {
  1: 'Pick who you are billing.',
  2: 'Choose the vehicle for this invoice.',
  3: 'Set the invoice date, due date, and payment terms.',
  4: 'Add your line items and charges.',
  5: 'Preview the invoice PDF, then save your draft.',
}

useWizardStepNarration(step, INVOICE_NARRATIONS)
const submitError = ref('')
const dirty = ref(false)
const lastSavedAt = ref<Date | null>(null)

const invoiceId = ref<string | null>(null)
const invoiceNumberFormatted = ref<string | null>(null)
const savedInvoice = ref<SavedInvoiceTotals | null>(null)
const editingSessionId = ref<string | null>(null)
let editingHeartbeatTimer: ReturnType<typeof setInterval> | null = null

const customerId = ref('')
const vehicleId = ref('')
const serviceLogId = ref('')
const invoiceDate = ref(new Date().toISOString().slice(0, 10))
const dueDate = ref(dueDateFromTerms(new Date().toISOString().slice(0, 10), 'net_30'))
const dueDateManual = ref(false)
const paymentTerms = ref('net_30')
const poNumber = ref('')

const lines = ref<DraftLine[]>([])
type LineEntryMode = 'guided' | 'manual' | null
const lineEntryMode = ref<LineEntryMode>(null)
const wizardLines = ref<WizardLineDraft[]>([])
const lineWizardRef = ref<{ openWizard: () => void } | null>(null)

watch(wizardLines, (wl) => {
  if (lineEntryMode.value === 'guided') {
    lines.value = wizardLinesToDraftLines(wl)
  }
}, { deep: true })

const route = useRoute()
if (typeof route.query.customerId === 'string' && route.query.customerId) {
  customerId.value = route.query.customerId
}
if (typeof route.query.vehicleId === 'string' && route.query.vehicleId) {
  vehicleId.value = route.query.vehicleId
}

const removedServerLineIds = ref<string[]>([])

const customerFilterQ = ref('')
const customerSearchQ = ref('')

let customerSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(customerFilterQ, (q) => {
  if (customerSearchTimer) clearTimeout(customerSearchTimer)
  customerSearchTimer = setTimeout(() => {
    customerSearchQ.value = q.trim()
  }, 300)
})

const {
  data: customersData,
  pending: customersPending,
  error: customersError,
  refresh: refreshCustomers,
} = useClientFetch<{ items: CustomerPick[] }>(
  '/api/customers',
  {
    query: computed(() => ({
      pageSize: 100,
      sort: 'name-asc' as const,
      q: customerSearchQ.value || undefined,
    })),
  },
)

const { data: presetCustomerData } = useClientFetch<{
  customer: CustomerPick
}>(
  () => (customerId.value ? `/api/customers/${customerId.value}` : null),
  { watch: [customerId] },
)

const customerOptions = computed(() => {
  const merged = new Map<string, CustomerPick>()
  for (const c of customersData.value?.items ?? []) merged.set(c.id, c)
  const preset = presetCustomerData.value?.customer
  if (preset) merged.set(preset.id, preset)
  return [...merged.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
})

const customersLoadError = computed(() =>
  customersError.value
    ? syncFetchErrorMessage(customersError.value, 'Could not load customers')
    : null,
)

const { data: vehiclesData, pending: vehiclesPending } = useClientFetch<{ items: VehiclePick[] }>(
  () => (customerId.value ? '/api/vehicles' : null),
  {
    query: computed(() => ({
      customerId: customerId.value,
      pageSize: 100,
      sort: 'tag-asc' as const,
    })),
    watch: [customerId],
  },
)

const { data: serviceLogsData } = useClientFetch<{ items: ServiceLogPick[] }>(
  () => (customerId.value ? '/api/service-logs' : null),
  {
    query: computed(() => ({
      customerId: customerId.value,
      queue: 'review' as const,
      pageSize: 50,
    })),
    watch: [customerId],
  },
)

watch(customerId, (id, oldId) => {
  if (oldId !== undefined && id !== oldId) {
    vehicleId.value = ''
    serviceLogId.value = ''
  }
})

watch([customerId, customerOptions], ([id]) => {
  if (!id) return
  const cust = customerOptions.value.find(c => c.id === id)
  if (cust?.paymentTerms) {
    paymentTerms.value = cust.paymentTerms
    if (!dueDateManual.value) dueDate.value = dueDateFromTerms(invoiceDate.value, paymentTerms.value)
  }
})

watch([invoiceDate, paymentTerms], () => {
  if (!dueDateManual.value) {
    dueDate.value = dueDateFromTerms(invoiceDate.value, paymentTerms.value)
  }
})

watch([customerId, vehicleId, serviceLogId, invoiceDate, dueDate, paymentTerms, poNumber, lines], () => {
  if (!dirtyReady.value) return
  dirty.value = true
}, { deep: true })

const dirtyReady = ref(false)
onMounted(() => {
  nextTick(() => { dirtyReady.value = true })
})

const vehicleOptions = computed(() => vehiclesData.value?.items ?? [])
const serviceLogOptions = computed(() => serviceLogsData.value?.items ?? [])

const selectedCustomer = computed(() => customerOptions.value.find(c => c.id === customerId.value))
const selectedVehicle = computed(() => vehicleOptions.value.find(v => v.id === vehicleId.value))
const autosaveLabel = computed(() => {
  if (busy.value) return 'Saving…'
  if (!invoiceId.value) return dirty.value ? 'Unsaved changes' : 'Not saved yet'
  if (dirty.value) return 'Unsaved changes'
  if (lastSavedAt.value) return `Saved ${auditWhenDisplay(lastSavedAt.value.toISOString())}`
  return 'Saved'
})

const autosaveClass = computed(() => {
  if (busy.value || dirty.value || !invoiceId.value) return 'pending'
  return ''
})

const summaryRows = computed(() => {
  const breakdown = previewLineTypeBreakdown(lines.value)
  const inv = savedInvoice.value ?? previewDraftTotals(lines.value, {
    taxExempt: selectedCustomer.value?.taxExempt,
  })
  return editorSummaryRows(inv, {
    breakdown,
    grandLabel: savedInvoice.value ? 'Total' : 'Estimated total',
  })
})

watch(step, async (n) => {
  if (n !== 5 || !invoiceId.value) return
  await nextTick()
  pdfPreviewRef.value?.refresh()
  pdfPreviewRef.value?.refit()
})

async function ensureEditingSession(id: string) {
  if (editingSessionId.value) return
  const { session } = await $fetch<{ session: { id: string } }>(
    '/api/editing-sessions/acquire',
    { method: 'POST', body: { entityType: 'invoice', entityId: id } },
  )
  editingSessionId.value = session.id
  if (!editingHeartbeatTimer) {
    editingHeartbeatTimer = setInterval(() => {
      if (!editingSessionId.value) return
      void $fetch(`/api/editing-sessions/${editingSessionId.value}/heartbeat`, { method: 'POST' })
    }, 20_000)
  }
}

function stopEditingSession() {
  if (editingHeartbeatTimer) {
    clearInterval(editingHeartbeatTimer)
    editingHeartbeatTimer = null
  }
  const id = editingSessionId.value
  editingSessionId.value = null
  if (id) {
    void $fetch(`/api/editing-sessions/${id}/release`, { method: 'POST' })
  }
}

onBeforeUnmount(() => stopEditingSession())

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function onDueDateInput(value: string) {
  dueDate.value = value
  dueDateManual.value = true
}

function onServiceLogPick(logId: string) {
  serviceLogId.value = logId
  if (!logId) return
  const log = serviceLogOptions.value.find(l => l.id === logId)
  if (log) vehicleId.value = log.vehicleId
}

const lineAcRefs = ref<Record<string, { focus: () => void } | null>>({})
const lineQtyRefs = ref<Record<string, { focus: () => void } | null>>({})
const lineRateRefs = ref<Record<string, { focus: () => void } | null>>({})

function addLine() {
  lines.value.push(createEmptyLine())
}

async function openLineWizardFromGesture() {
  unlockSpeechFromUserGesture({ silent: true })
  await nextTick()
  await nextTick()
  lineWizardRef.value?.openWizard()
}

function selectLineEntryMode(mode: Exclude<LineEntryMode, null>) {
  lineEntryMode.value = mode
  if (mode === 'guided') {
    wizardLines.value = lines.value
      .filter(isDraftLineValid)
      .map(draftLineToWizard)
    void openLineWizardFromGesture()
  }
  else if (!lines.value.length) {
    lines.value = [createEmptyLine()]
  }
}

function clearLineEntryMode() {
  if (lineEntryMode.value === 'guided') {
    lines.value = wizardLinesToDraftLines(wizardLines.value)
  }
  lineEntryMode.value = null
}

function prevFromLinesStep() {
  if (lineEntryMode.value) {
    clearLineEntryMode()
    return
  }
  prevStep()
}

async function continueToReview() {
  if (lineEntryMode.value === 'guided') {
    lines.value = wizardLinesToDraftLines(wizardLines.value)
  }
  if (!canProceedWizardStep(4, { customerId: customerId.value, vehicleId: vehicleId.value, lines: lines.value })) {
    submitError.value = 'Add at least one complete line item.'
    return
  }
  submitError.value = ''
  const ok = await saveDraft()
  if (ok) nextStep()
}

function removeLine(localId: string) {
  if (lines.value.length <= 1) return
  const line = lines.value.find(l => l.localId === localId)
  if (line?.serverId) removedServerLineIds.value.push(line.serverId)
  lines.value = lines.value.filter(l => l.localId !== localId)
}

function applyCatalogToLine(line: DraftLine, item: CatalogQuickItem) {
  const fields = applyCatalogItemToLineFields(item)
  line.lineType = fields.lineType
  line.description = fields.description
  line.quantity = fields.quantity
  line.unitPrice = fields.unitPrice
  line.catalogItemId = fields.catalogItemId
}

function onLineDescriptionTyped(line: DraftLine) {
  line.catalogItemId = null
}

function onLineFieldBlur(line: DraftLine) {
  applyInferredLineType(line)
}

function setLineAcRef(localId: string, el: unknown) {
  lineAcRefs.value[localId] = el as { focus: () => void } | null
}

function setLineQtyRef(localId: string, el: unknown) {
  lineQtyRefs.value[localId] = el as { focus: () => void } | null
}

function setLineRateRef(localId: string, el: unknown) {
  lineRateRefs.value[localId] = el as { focus: () => void } | null
}

function focusLineQty(localId: string) {
  lineQtyRefs.value[localId]?.focus()
}

function focusLineRate(localId: string) {
  lineRateRefs.value[localId]?.focus()
}

function addLineAndFocusDescription() {
  addLine()
  nextTick(() => {
    const newest = lines.value[lines.value.length - 1]
    if (newest) lineAcRefs.value[newest.localId]?.focus()
  })
}

function onLineRateTabNext(line: DraftLine) {
  onLineFieldBlur(line)
  addLineAndFocusDescription()
}

function focusCatalogSearch() {
  const target = lines.value.find(l => !l.description.trim()) ?? lines.value[lines.value.length - 1]
  if (!target) {
    addLine()
    nextTick(() => {
      const newest = lines.value[lines.value.length - 1]
      if (newest) lineAcRefs.value[newest.localId]?.focus()
    })
    return
  }
  lineAcRefs.value[target.localId]?.focus()
}

function nextStep() {
  if (step.value < 5) step.value += 1
}

function prevStep() {
  if (step.value > 1) step.value -= 1
}

async function refreshSavedInvoice() {
  if (!invoiceId.value) return
  const { invoice } = await $fetch<{
    invoice: SavedInvoiceTotals & { lineItems: { id: string, lineAmount: string }[] }
  }>(`/api/invoices/${invoiceId.value}`)
  savedInvoice.value = invoice
  invoiceNumberFormatted.value = invoice.invoiceNumberFormatted
  invoice.lineItems.forEach((serverLine, i) => {
    const local = lines.value[i]
    if (local) {
      local.serverId = serverLine.id
      local.lineAmount = serverLine.lineAmount
    }
  })
}

async function ensureDraft(): Promise<string> {
  const body = {
    creationSource: serviceLogId.value ? 'service_log' as const : 'customer' as const,
    customerId: customerId.value,
    vehicleId: vehicleId.value || null,
    serviceLogId: serviceLogId.value || null,
    invoiceDate: invoiceDate.value,
    dueDate: dueDate.value || null,
    paymentTerms: paymentTerms.value,
    poNumber: poNumber.value || null,
  }

  if (invoiceId.value) {
    await ensureEditingSession(invoiceId.value)
    await $fetch(`/api/invoices/${invoiceId.value}`, { method: 'PATCH', body })
    return invoiceId.value
  }

  const { invoice } = await $fetch<{ invoice: { id: string, invoiceNumber: number } }>(
    '/api/invoices',
    { method: 'POST', body },
  )
  invoiceId.value = invoice.id
  invoiceNumberFormatted.value = formatInvoiceNumberDisplay(invoice.invoiceNumber)
  await ensureEditingSession(invoice.id)
  return invoice.id
}

async function syncLines(id: string) {
  const keptServerIds = new Set(
    lines.value.map(l => l.serverId).filter((sid): sid is string => Boolean(sid)),
  )
  for (const lineId of removedServerLineIds.value) {
    if (keptServerIds.has(lineId)) continue
    try {
      await $fetch(`/api/invoices/${id}/line-items/${lineId}`, { method: 'DELETE' })
    }
    catch {
      // Line may already be gone — continue syncing the rest
    }
  }
  removedServerLineIds.value = []

  for (let i = 0; i < lines.value.length; i++) {
    const line = lines.value[i]
    if (!line) continue
    const body = buildInvoiceLinePatchBody(line, { catalogItemId: line.catalogItemId ?? null })
    if (!body || !body.quantity || body.unitPrice === undefined) continue

    const quantity = formatQuantityField(line.quantity)
    const unitPrice = formatUnitPriceField(line.unitPrice)
    if (quantity) line.quantity = quantity
    if (unitPrice !== null) line.unitPrice = unitPrice

    const payload = { ...body, sortOrder: i }

    if (line.serverId) {
      const { line: updated } = await $fetch<{ line: { id: string, lineAmount: string } }>(
        `/api/invoices/${id}/line-items/${line.serverId}`,
        { method: 'PATCH', body: payload },
      )
      line.lineAmount = updated.lineAmount
      continue
    }

    const { line: created } = await $fetch<{ line: { id: string, lineAmount: string } }>(
      `/api/invoices/${id}/line-items`,
      { method: 'POST', body: payload },
    )
    line.serverId = created.id
    line.lineAmount = created.lineAmount
  }
}

async function saveDraft(): Promise<boolean> {
  if (!customerId.value) {
    submitError.value = 'Select a customer first'
    return false
  }
  busy.value = true
  submitError.value = ''
  try {
    const id = await ensureDraft()
    await syncLines(id)
    await refreshSavedInvoice()
    dirty.value = false
    lastSavedAt.value = new Date()
    return true
  }
  catch (e: unknown) {
    submitError.value = syncFetchErrorMessage(e, 'Save failed')
    return false
  }
  finally {
    busy.value = false
  }
}

async function saveDraftAndFinish() {
  const ok = await saveDraft()
  if (ok) await navigateTo('/invoices')
}


</script>

<template>
  <section class="page active sl-page inv-wizard-page">
    <StaffPageHead subtitle="Step-by-step billing · save a draft at any step">
      <template #title>
        New invoice
        <span v-if="!invoiceId" class="pill draft" style="vertical-align:3px; margin-left:6px;">Unsaved</span>
      </template>
      <template #actions>
        <button type="button" class="btn" :disabled="busy || !customerId" @click="saveDraft">Save draft</button>
        <NuxtLink to="/invoices" class="btn">Cancel</NuxtLink>
      </template>
    </StaffPageHead>

    <div class="sl-progress" aria-label="Progress">
      <div
        v-for="s in INVOICE_WIZARD_STEPS"
        :key="s.n"
        class="sl-step"
        :class="{ on: step === s.n, done: step > s.n }"
      >
        <div class="dot">{{ s.n }}</div>{{ s.label }}
      </div>
    </div>

    <p v-if="invoiceNumberFormatted || autosaveLabel" class="inv-wizard-meta">
      <span v-if="invoiceNumberFormatted" class="pill gray">{{ invoiceNumberFormatted }}</span>
      <span class="autosave" :class="autosaveClass">{{ autosaveLabel }}</span>
    </p>

    <p v-if="submitError" class="help inv-wizard-error">{{ submitError }}</p>

    <!-- Step 1: Customer -->
    <div v-show="step === 1" class="sl-panel active">
      <h3>Which customer?</h3>
      <p class="sl-hint">Select the billing account for this invoice.</p>
      <label class="fld">
        <span>Search</span>
        <input
          v-model="customerFilterQ"
          type="search"
          placeholder="Type a name to search…"
          aria-label="Search customers"
          autocomplete="off"
        >
      </label>
      <div v-if="customersPending && !customerOptions.length" class="cp-state" style="padding:16px 0;">
        Loading customers…
      </div>
      <div v-else-if="customersLoadError">
        <p class="help" style="color:#dc2626; margin:0 0 10px;">{{ customersLoadError }}</p>
        <button type="button" class="btn sm" @click="refreshCustomers()">Retry</button>
      </div>
      <p v-else-if="!customerOptions.length" class="sl-empty-veh">
        No customers found. Try a different search or add a customer first.
      </p>
      <div v-else class="sl-picks">
        <button
          v-for="c in customerOptions"
          :key="c.id"
          type="button"
          class="sl-pick"
          :class="{ on: customerId === c.id }"
          @click="customerId = c.id"
        >
          <span class="av teal">{{ initials(c.displayName) }}</span>
          <span class="nm">
            <b>{{ c.displayName }}</b>
            <small>{{ c.accountKind === 'fleet' ? 'Fleet' : 'Individual' }} · {{ paymentTermsLabel(c.paymentTerms) }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
      <div class="sl-foot">
        <button type="button" class="btn" disabled>Back</button>
        <button
          type="button"
          class="btn primary"
          :disabled="!canProceedWizardStep(1, { customerId, vehicleId, lines })"
          @click="nextStep"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step 2: Vehicle -->
    <div v-show="step === 2" class="sl-panel active">
      <h3>Which vehicle?</h3>
      <p class="sl-hint">Pick the unit for this invoice, or continue without one.</p>
      <div v-if="vehiclesPending && !vehicleOptions.length" class="cp-state" style="padding:12px 0;">
        Loading vehicles…
      </div>
      <div v-else-if="vehicleOptions.length" class="sl-picks">
        <button
          v-for="v in vehicleOptions"
          :key="v.id"
          type="button"
          class="sl-pick"
          :class="{ on: vehicleId === v.id }"
          @click="vehicleId = v.id"
        >
          <span class="av indigo">{{ (v.busNumber ?? v.unitTag ?? 'U').slice(0, 2) }}</span>
          <span class="nm">
            <b>{{ vehicleTag(v) }}</b>
            <small>{{ vehicleSub(v) }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
      <div v-else class="sl-empty-veh">No vehicles for this customer yet.</div>
      <p v-if="selectedVehicle" class="help" style="margin-top:12px;">
        <template v-if="selectedVehicle.vin">VIN {{ selectedVehicle.vin }}</template>
        <template v-if="selectedVehicle.vin && selectedVehicle.odometer"> · </template>
        <template v-if="selectedVehicle.odometer">
          {{ odoDisplay(selectedVehicle.odometer, selectedVehicle.odometerUnit) }}
        </template>
      </p>
      <label v-if="serviceLogOptions.length" class="fld" style="margin-top:16px;">
        <span>Start from a service log</span>
        <select :value="serviceLogId" @change="onServiceLogPick(($event.target as HTMLSelectElement).value)">
          <option value="">— None —</option>
          <option v-for="log in serviceLogOptions" :key="log.id" :value="log.id">
            {{ logNumberDisplay(log.logNumber) }} — {{ vehicleTag(log.vehicle) }}
          </option>
        </select>
        <span class="help">Pre-fills the vehicle from the log</span>
      </label>
      <div class="sl-foot">
        <button type="button" class="btn" @click="prevStep">Back</button>
        <button
          type="button"
          class="btn primary"
          :disabled="!canProceedWizardStep(2, { customerId, vehicleId, lines })"
          @click="nextStep"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step 3: Dates & terms -->
    <div v-show="step === 3" class="sl-panel active">
      <h3>Dates &amp; terms</h3>
      <p class="sl-hint">Invoice date, due date, and payment terms.</p>
      <label class="fld"><span>Invoice Date</span><input v-model="invoiceDate" type="date" required></label>
      <label class="fld"><span>Due date</span>
        <input :value="dueDate" type="date" required @input="onDueDateInput(($event.target as HTMLInputElement).value)">
      </label>
      <label class="fld"><span>Payment terms</span>
        <select v-model="paymentTerms">
          <option value="due_on_receipt">Due on receipt</option>
          <option value="net_15">Net 15</option>
          <option value="net_30">Net 30</option>
          <option value="net_45">Net 45</option>
          <option value="net_60">Net 60</option>
        </select>
      </label>
      <label class="fld"><span>PO / reference</span>
        <input v-model="poNumber" type="text" placeholder="Optional customer PO">
      </label>
      <div class="sl-foot">
        <button type="button" class="btn" @click="prevStep">Back</button>
        <button
          type="button"
          class="btn primary"
          :disabled="!canProceedWizardStep(3, { customerId, vehicleId, lines })"
          @click="nextStep"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step 4: Line items -->
    <div v-show="step === 4" class="sl-panel active">
      <h3>Line items</h3>
      <p v-if="!lineEntryMode" class="sl-hint">How do you want to add charges?</p>

      <div v-if="!lineEntryMode" class="sl-picks sl-log-modes">
        <button type="button" class="sl-pick sl-log-mode" @click="selectLineEntryMode('guided')">
          <span class="av teal" aria-hidden="true">🎙️</span>
          <span class="nm">
            <b>{{ VOICE_ENTRY_PICK.title }}</b>
            <small>{{ VOICE_ENTRY_PICK.invoiceDescription }}</small>
          </span>
          <span class="chk" />
        </button>
        <button type="button" class="sl-pick sl-log-mode" @click="selectLineEntryMode('manual')">
          <span class="av indigo" aria-hidden="true">✏️</span>
          <span class="nm">
            <b>{{ MANUAL_ENTRY_PICK.title }}</b>
            <small>{{ MANUAL_ENTRY_PICK.description }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>

      <div v-else-if="lineEntryMode === 'guided'" class="card inv-line-editor">
        <div class="cbody inv-guided-lines">
          <CommonLineItemWizard
            ref="lineWizardRef"
            v-model:lines="wizardLines"
          />
          <button type="button" class="btn ghost sm sl-change-mode" @click="clearLineEntryMode">Change method</button>
        </div>
      </div>

      <template v-else>
        <div class="card inv-line-editor">
          <div class="chead inv-line-editor-head">
            <div class="right inv-line-actions">
              <button type="button" class="btn sm" title="Search catalog in the description field (↑↓ Enter)" @click="focusCatalogSearch">From catalog</button>
              <button type="button" class="btn sm primary" @click="addLine">+ Add line</button>
            </div>
          </div>
          <div class="cbody">
            <div class="tscroll inv-line-table inv-line-table--desktop">
              <table class="ed-lines">
                <thead>
                  <tr>
                    <th style="width:110px">Type</th>
                    <th>Description</th>
                    <th style="width:110px">Qty / Hrs</th>
                    <th style="width:150px">Rate</th>
                    <th style="width:130px; text-align:right">Amount</th>
                    <th style="width:36px" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in lines" :key="line.localId">
                    <td>
                      <select v-model="line.lineType">
                        <option v-for="opt in LINE_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </td>
                    <td>
                      <CatalogLineAutocomplete
                        :ref="(el) => setLineAcRef(line.localId, el)"
                        v-model="line.description"
                        v-model:line-type="line.lineType"
                        @typed="onLineDescriptionTyped(line)"
                        @blur="onLineFieldBlur(line)"
                        @tab-next="focusLineQty(line.localId)"
                        @select="applyCatalogToLine(line, $event)"
                      />
                    </td>
                    <td>
                      <LineQuantityInput
                        :ref="(el) => setLineQtyRef(line.localId, el)"
                        v-model="line.quantity"
                        @blur="onLineFieldBlur(line)"
                        @tab-next="focusLineRate(line.localId)"
                      />
                    </td>
                    <td>
                      <LineCurrencyInput
                        :ref="(el) => setLineRateRef(line.localId, el)"
                        v-model="line.unitPrice"
                        @blur="onLineFieldBlur(line)"
                        @tab-next="onLineRateTabNext(line)"
                      />
                    </td>
                    <td class="amt">{{ moneyDisplay(previewLineAmount(line.quantity, line.unitPrice) || line.lineAmount || '0') }}</td>
                    <td>
                      <button type="button" class="rm" aria-label="Remove line" :disabled="lines.length <= 1" @click="removeLine(line.localId)">✕</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="inv-line-cards inv-line-table--mobile">
              <article v-for="line in lines" :key="`card-${line.localId}`" class="inv-line-card">
                <div class="inv-line-card-head">
                  <label class="fld inv-line-card-type">
                    <span>Type</span>
                    <select v-model="line.lineType">
                      <option v-for="opt in LINE_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </label>
                  <button type="button" class="rm" aria-label="Remove line" :disabled="lines.length <= 1" @click="removeLine(line.localId)">✕</button>
                </div>
                <label class="fld">
                  <span>Description</span>
                  <CatalogLineAutocomplete
                    :ref="(el) => setLineAcRef(line.localId, el)"
                    v-model="line.description"
                    v-model:line-type="line.lineType"
                    @typed="onLineDescriptionTyped(line)"
                    @blur="onLineFieldBlur(line)"
                    @tab-next="focusLineQty(line.localId)"
                    @select="applyCatalogToLine(line, $event)"
                  />
                </label>
                <div class="inv-line-card-nums">
                  <label class="fld">
                    <span>Qty / Hrs</span>
                    <LineQuantityInput
                      :ref="(el) => setLineQtyRef(line.localId, el)"
                      v-model="line.quantity"
                      @blur="onLineFieldBlur(line)"
                      @tab-next="focusLineRate(line.localId)"
                    />
                  </label>
                  <label class="fld">
                    <span>Rate</span>
                    <LineCurrencyInput
                      :ref="(el) => setLineRateRef(line.localId, el)"
                      v-model="line.unitPrice"
                      @blur="onLineFieldBlur(line)"
                      @tab-next="onLineRateTabNext(line)"
                    />
                  </label>
                  <div class="inv-line-card-amt">
                    <span class="k">Amount</span>
                    <span class="v">{{ moneyDisplay(previewLineAmount(line.quantity, line.unitPrice) || line.lineAmount || '0') }}</span>
                  </div>
                </div>
              </article>
            </div>
            <button type="button" class="btn ghost sm sl-change-mode" @click="clearLineEntryMode">Change method</button>
          </div>
        </div>
      </template>

      <div v-if="lineEntryMode" class="ed-sums inv-wizard-sums">
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

      <div class="sl-foot">
        <button type="button" class="btn" @click="prevFromLinesStep">Back</button>
        <button
          type="button"
          class="btn primary"
          :disabled="busy || !lineEntryMode || !canProceedWizardStep(4, { customerId, vehicleId, lines })"
          @click="continueToReview"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step 5: Review -->
    <div v-show="step === 5" class="sl-panel active inv-wizard-review">
      <h3>Review &amp; finish</h3>
      <p class="sl-hint">Preview how this invoice will look as a PDF, then save your draft.</p>
      <div v-if="invoiceId && invoiceNumberFormatted" class="inv-wizard-pdf">
        <InvoicePdfPreviewPane
          ref="pdfPreviewRef"
          :invoice-id="invoiceId"
          :invoice-label="invoiceNumberFormatted"
          :can-generate-pdf="canGeneratePdf"
          :show-download="false"
        />
      </div>
      <p v-else class="help inv-wizard-pdf-empty">Save your line items first to preview the PDF.</p>
      <div class="sl-foot inv-wizard-review-foot">
        <button type="button" class="btn" :disabled="busy" @click="prevStep">Back</button>
        <button
          type="button"
          class="btn primary"
          :disabled="busy || !invoiceId"
          @click="saveDraftAndFinish"
        >
          {{ busy ? 'Saving…' : 'Save draft' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.inv-wizard-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: -8px 0 16px;
  font-size: 12px;
}

.inv-wizard-meta .autosave {
  margin-left: auto;
  font-weight: 600;
  color: #059669;
}

.inv-wizard-meta .autosave.pending {
  color: #d97706;
}

.inv-wizard-error {
  color: #dc2626;
  margin: -8px 0 16px;
}

.inv-line-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-bottom: 0;
}

.inv-line-editor-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.inv-line-editor .cbody {
  padding-top: 12px;
}

.inv-line-table--desktop {
  margin-bottom: 8px;
}

.inv-line-cards {
  display: none;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.inv-line-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}

.inv-line-card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.inv-line-card-type {
  flex: 1;
  margin: 0;
}

.inv-line-card-nums {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.inv-line-card-nums .fld {
  margin: 0;
}

.inv-line-card-amt {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.inv-line-card-amt .k {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.inv-line-card-amt .v {
  font-size: 16px;
  font-weight: 800;
  color: #4f46e5;
  font-variant-numeric: tabular-nums;
}

.inv-wizard-review-foot {
  flex-wrap: wrap;
}

.inv-wizard-review-foot .btn.primary {
  flex: 1.4;
  min-width: 140px;
}

.inv-wizard-pdf {
  min-height: min(72vh, 820px);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
}

.inv-wizard-pdf-empty {
  margin: 0 0 16px;
  padding: 32px 16px;
  text-align: center;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

@media (max-width: 720px) {
  .inv-line-table--desktop {
    display: none;
  }

  .inv-line-cards {
    display: flex;
  }
}

.inv-wizard-sums {
  margin-top: 16px;
  border-radius: 12px;
  overflow: hidden;
}
</style>
