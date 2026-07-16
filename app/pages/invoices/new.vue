<script setup lang="ts">
// Invoice creator wizard — customer → vehicle → lines → review (mockup: PAGE: INVOICE CREATOR / P1-23).
import CatalogLineAutocomplete from '~/components/invoices/CatalogLineAutocomplete.vue'
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
  invoiceDateDisplay,
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

const canApprove = computed(() => auth.can('invoices.approve.all'))
const canSend = computed(() => auth.can('invoices.send.all'))

const step = ref(1)
const busy = ref(false)

const INVOICE_NARRATIONS: Record<number, string> = {
  1: 'Pick who you are billing.',
  2: 'Choose the vehicle and invoice dates.',
  3: 'Add your line items and charges.',
  4: 'Review totals, then save or send.',
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
  const inv = savedInvoice.value ?? previewDraftTotals(lines.value, {
    taxExempt: selectedCustomer.value?.taxExempt,
  })
  return editorSummaryRows(inv, {
    breakdown: previewLineTypeBreakdown(lines.value),
    grandLabel: savedInvoice.value ? 'Total' : 'Estimated total',
  })
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
  if (!canProceedWizardStep(3, { customerId: customerId.value, vehicleId: vehicleId.value, lines: lines.value })) {
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
  if (step.value < 4) step.value += 1
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

async function continueToLines() {
  if (!canProceedWizardStep(2, { customerId: customerId.value, vehicleId: vehicleId.value, lines: lines.value })) return
  nextStep()
}

async function saveAndContinueEditing() {
  const ok = await saveDraft()
  if (ok && invoiceId.value) await navigateTo(`/invoices/${invoiceId.value}/edit`)
}

async function finalizeAndSend() {
  if (!canApprove.value || !canSend.value) {
    submitError.value = 'You need approve and send permissions to finalize and email this invoice.'
    return
  }
  const ok = await saveDraft()
  if (!ok || !invoiceId.value) return
  busy.value = true
  submitError.value = ''
  try {
    if (canApprove.value) await $fetch(`/api/invoices/${invoiceId.value}/approve`, { method: 'POST' })
    if (canSend.value) await $fetch(`/api/invoices/${invoiceId.value}/send`, { method: 'POST' })
    await navigateTo(`/invoices/${invoiceId.value}`)
  }
  catch (e: unknown) {
    submitError.value = syncFetchErrorMessage(e, 'Finalize failed')
  }
  finally {
    busy.value = false
  }
}

const validLines = computed(() => lines.value.filter(isDraftLineValid))
</script>

<template>
  <section class="page active sl-page">
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
            <small>{{ c.accountKind === 'fleet' ? 'Fleet' : 'Individual' }}</small>
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

    <!-- Step 2: Vehicle + dates -->
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

      <h3 style="margin-top:28px;">Dates &amp; terms</h3>
      <p class="sl-hint">Issue date, due date, and payment terms.</p>
      <label class="fld"><span>Issue date</span><input v-model="invoiceDate" type="date" required></label>
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
          :disabled="!canProceedWizardStep(2, { customerId, vehicleId, lines })"
          @click="continueToLines"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step 3: Line items -->
    <div v-show="step === 3" class="sl-panel active">
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

      <div v-else-if="lineEntryMode === 'guided'" class="inv-guided-lines">
        <CommonLineItemWizard
          ref="lineWizardRef"
          v-model:lines="wizardLines"
        />
        <button type="button" class="btn ghost sm sl-change-mode" @click="clearLineEntryMode">Change method</button>
      </div>

      <template v-else>
        <div class="inv-line-actions">
          <button type="button" class="btn sm" title="Search catalog in the description field (↑↓ Enter)" @click="focusCatalogSearch">From catalog</button>
          <button type="button" class="btn sm primary" @click="addLine">+ Add line</button>
        </div>
        <div class="tscroll inv-line-table">
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
                    @select="applyCatalogToLine(line, $event)"
                  />
                </td>
                <td><input v-model="line.quantity" class="num" type="number" step="0.25" min="0" @blur="onLineFieldBlur(line)"></td>
                <td><input v-model="line.unitPrice" class="num" type="number" step="0.01" min="0" @blur="onLineFieldBlur(line)"></td>
                <td class="amt">{{ moneyDisplay(previewLineAmount(line.quantity, line.unitPrice) || line.lineAmount || '0') }}</td>
                <td>
                  <button type="button" class="rm" aria-label="Remove line" :disabled="lines.length <= 1" @click="removeLine(line.localId)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="button" class="btn ghost sm sl-change-mode" @click="clearLineEntryMode">Change method</button>
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
          :disabled="busy || !lineEntryMode || !canProceedWizardStep(3, { customerId, vehicleId, lines })"
          @click="continueToReview"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step 4: Review -->
    <div v-show="step === 4" class="sl-panel active">
      <h3>Review &amp; finish</h3>
      <p class="sl-hint">Confirm details before saving or sending the invoice.</p>
      <div class="sl-review">
        <div class="r">
          <span class="k">Invoice</span>
          <span class="v">{{ invoiceNumberFormatted ?? 'Assigned when saved' }}</span>
        </div>
        <div class="r"><span class="k">Customer</span><span class="v">{{ selectedCustomer?.displayName ?? '—' }}</span></div>
        <div class="r"><span class="k">Vehicle</span><span class="v">{{ selectedVehicle ? vehicleTag(selectedVehicle) : '—' }}</span></div>
        <div class="r">
          <span class="k">Issue / due</span>
          <span class="v">{{ invoiceDateDisplay(invoiceDate) }} → {{ invoiceDateDisplay(dueDate) }}</span>
        </div>
        <div class="r"><span class="k">Terms</span><span class="v">{{ paymentTermsLabel(paymentTerms) }}</span></div>
        <div class="r"><span class="k">Line items</span><span class="v">{{ validLines.length }}</span></div>
        <div class="r">
          <span class="k">Total</span>
          <span class="v" style="color:#4f46e5;">{{ moneyDisplay((savedInvoice ?? previewDraftTotals(lines, { taxExempt: selectedCustomer?.taxExempt })).total) }}</span>
        </div>
        <div class="r stack">
          <span class="k">On finalize</span>
          <span class="v">Generate PDF and email the customer. Portal access is updated immediately.</span>
        </div>
      </div>
      <button
        type="button"
        class="btn ghost sm sl-change-mode"
        :disabled="busy || !invoiceId"
        @click="saveAndContinueEditing"
      >
        Save draft &amp; open full editor
      </button>
      <div class="sl-foot">
        <button type="button" class="btn" :disabled="busy" @click="prevStep">Back</button>
        <button
          type="button"
          class="btn primary"
          :disabled="busy || !invoiceId || !canApprove || !canSend"
          :title="!canApprove || !canSend ? 'Requires approve and send permissions' : undefined"
          @click="finalizeAndSend"
        >
          {{ busy ? 'Sending…' : 'Finalize & send' }}
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
  margin-bottom: 12px;
}

.inv-line-table {
  margin-bottom: 8px;
}

.inv-wizard-sums {
  margin-top: 16px;
  border-radius: 12px;
  overflow: hidden;
}
</style>
