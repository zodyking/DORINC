<script setup lang="ts">
// Invoice creator wizard — customer → vehicle → lines → review (mockup: PAGE: INVOICE CREATOR / P1-23).
import CatalogLineAutocomplete from '~/components/invoices/CatalogLineAutocomplete.vue'
import { applyCatalogItemToLineFields, editorSummaryRows, type CatalogQuickItem } from '~/utils/invoice-editor-ui'
import {
  draftLineToWizard,
  wizardLinesToDraftLines,
  type WizardLineDraft,
} from '~/utils/line-item-wizard-ui'

definePageMeta({ layout: 'staff' })

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
if (import.meta.client && auth.loaded && !auth.can('invoices.create.all')) {
  navigateTo('/invoices')
}

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

const { data: customersData } = await useFetch<{ items: CustomerPick[] }>(
  '/api/customers',
  { query: { pageSize: 100, sort: 'name-asc' } },
)

const customerOptions = computed(() => customersData.value?.items ?? [])

const { data: vehiclesData, refresh: refreshVehicles } = await useFetch<{ items: VehiclePick[] }>(
  '/api/vehicles',
  { query: computed(() => ({
    customerId: customerId.value || undefined,
    pageSize: 100,
    sort: 'tag-asc',
  })) },
)

const { data: serviceLogsData, refresh: refreshServiceLogs } = await useFetch<{ items: ServiceLogPick[] }>(
  '/api/service-logs',
  {
    query: computed(() => ({
      customerId: customerId.value || undefined,
      queue: 'review' as const,
      pageSize: 50,
    })),
    immediate: false,
  },
)

watch(customerId, (id) => {
  vehicleId.value = ''
  serviceLogId.value = ''
  if (id) {
    refreshVehicles()
    refreshServiceLogs()
    const cust = customerOptions.value.find(c => c.id === id)
    if (cust?.paymentTerms) {
      paymentTerms.value = cust.paymentTerms
      if (!dueDateManual.value) dueDate.value = dueDateFromTerms(invoiceDate.value, paymentTerms.value)
    }
  }
})

watch([invoiceDate, paymentTerms], () => {
  if (!dueDateManual.value) {
    dueDate.value = dueDateFromTerms(invoiceDate.value, paymentTerms.value)
  }
})

watch([customerId, vehicleId, serviceLogId, invoiceDate, dueDate, paymentTerms, poNumber, lines], () => {
  dirty.value = true
}, { deep: true })

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

function invoiceErrorMessage(err: unknown, fallback: string): string {
  const e = err as { data?: { message?: string, data?: { message?: string } } }
  return e.data?.data?.message ?? e.data?.message ?? fallback
}

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

function goToStep(n: number) {
  if (n < step.value) step.value = n
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
  for (let i = 0; i < lines.value.length; i++) {
    const line = lines.value[i]!
    if (!isDraftLineValid(line)) continue

    const body = {
      lineType: line.lineType,
      description: line.description.trim(),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      catalogItemId: line.catalogItemId || null,
      sortOrder: i,
    }

    if (line.serverId) {
      const { line: updated } = await $fetch<{ line: { id: string, lineAmount: string } }>(
        `/api/invoices/${id}/line-items/${line.serverId}`,
        { method: 'PATCH', body },
      )
      line.lineAmount = updated.lineAmount
      continue
    }

    const { line: created } = await $fetch<{ line: { id: string, lineAmount: string } }>(
      `/api/invoices/${id}/line-items`,
      { method: 'POST', body: { ...body } },
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
    submitError.value = invoiceErrorMessage(e, 'Save failed')
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
  if (ok && invoiceId.value) await navigateTo(`/invoices/${invoiceId.value}`)
}

async function finalizeAndSend() {
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
    submitError.value = invoiceErrorMessage(e, 'Finalize failed')
  }
  finally {
    busy.value = false
  }
}

const validLines = computed(() => lines.value.filter(isDraftLineValid))
</script>

<template>
  <section class="page active inv-wizard-page">
    <div class="pagehead">
      <div>
        <h2>
          New Invoice
          <span class="pill draft" style="vertical-align:3px">{{ invoiceId ? 'Draft' : 'Unsaved' }}</span>
        </h2>
        <p>Create, save at any step, and resume later — PDF when finalized</p>
      </div>
      <div class="actions">
        <button type="button" class="btn" :disabled="busy || !customerId" @click="saveDraft">Save draft</button>
        <NuxtLink to="/invoices" class="btn">Cancel</NuxtLink>
      </div>
    </div>
    <div class="wizbar">
      <span class="state">Workflow: <b>{{ wizardStateLabel(step) }}</b></span>
      <span v-if="invoiceNumberFormatted" class="pill gray">{{ invoiceNumberFormatted }}</span>
      <span class="autosave" :class="autosaveClass">{{ autosaveLabel }}</span>
    </div>

    <div class="wizard" aria-label="Invoice wizard steps">
      <button
        v-for="s in INVOICE_WIZARD_STEPS"
        :key="s.n"
        type="button"
        class="wstep"
        :class="{ on: step === s.n, done: step > s.n }"
        :disabled="s.n > step"
        @click="goToStep(s.n)"
      >
        <span class="n">{{ s.n }}</span> {{ s.label }}
      </button>
    </div>

    <p v-if="submitError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ submitError }}</p>

    <!-- Step 1: Customer -->
    <div v-show="step === 1" class="wpanel" :class="{ active: step === 1 }">
      <div class="card">
        <div class="chead"><h3>Who is this invoice for?</h3></div>
        <div class="cbody">
          <p class="sl-hint" style="margin:0 0 14px;">Select the billing account.</p>
          <div class="sl-picks">
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
        </div>
      </div>
      <div class="wiz-foot">
        <button type="button" class="btn" disabled>Back</button>
        <button
          type="button"
          class="btn primary"
          :disabled="!canProceedWizardStep(1, { customerId, vehicleId, lines })"
          @click="nextStep"
        >
          Continue to vehicle →
        </button>
      </div>
    </div>

    <!-- Step 2: Vehicle + dates -->
    <div v-show="step === 2" class="wpanel" :class="{ active: step === 2 }">
      <div class="cols">
        <div class="card">
          <div class="chead"><h3>Vehicle</h3></div>
          <div class="cbody">
            <div v-if="vehicleOptions.length" class="sl-picks">
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
            <div v-else class="sl-empty-veh">No vehicles for this customer yet — you can continue without one.</div>
            <p v-if="selectedVehicle" class="help" style="margin-top:12px;">
              <template v-if="selectedVehicle.vin">VIN {{ selectedVehicle.vin }}</template>
              <template v-if="selectedVehicle.vin && selectedVehicle.odometer"> · </template>
              <template v-if="selectedVehicle.odometer">
                {{ odoDisplay(selectedVehicle.odometer, selectedVehicle.odometerUnit) }}
              </template>
            </p>
            <label v-if="serviceLogOptions.length" class="fld" style="margin-top:16px;">
              <span>Or start from a service log</span>
              <select :value="serviceLogId" @change="onServiceLogPick(($event.target as HTMLSelectElement).value)">
                <option value="">— None —</option>
                <option v-for="log in serviceLogOptions" :key="log.id" :value="log.id">
                  {{ logNumberDisplay(log.logNumber) }} — {{ vehicleTag(log.vehicle) }}
                </option>
              </select>
              <span class="help">Pre-fills customer &amp; vehicle from the log</span>
            </label>
          </div>
        </div>
        <div class="card">
          <div class="chead"><h3>Dates &amp; terms</h3></div>
          <div class="cbody">
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
          </div>
        </div>
      </div>
      <div class="wiz-foot">
        <button type="button" class="btn" @click="prevStep">← Back</button>
        <div class="wiz-foot-right">
          <button type="button" class="btn" :disabled="busy" @click="saveDraft">Save draft</button>
          <button
            type="button"
            class="btn primary"
            :disabled="!canProceedWizardStep(2, { customerId, vehicleId, lines })"
            @click="continueToLines"
          >
            Continue to line items →
          </button>
        </div>
      </div>
    </div>

    <!-- Step 3: Line items -->
    <div v-show="step === 3" class="wpanel" :class="{ active: step === 3 }">
      <div class="card">
        <div class="chead">
          <h3>Line items</h3>
        </div>
        <div class="cbody">
          <p v-if="!lineEntryMode" class="sl-hint" style="margin-top:0;">
            How do you want to add charges? Voice lines or the manual table.
          </p>

          <div v-if="!lineEntryMode" class="sl-picks sl-log-modes" style="margin-bottom:0;">
            <button type="button" class="sl-pick sl-log-mode" @click="selectLineEntryMode('guided')">
              <span class="av teal" aria-hidden="true">🎙️</span>
              <span class="nm">
                <b>Voice lines</b>
                <small>Speak each charge — labor, parts, services, fees</small>
              </span>
              <span class="chk" />
            </button>
            <button type="button" class="sl-pick sl-log-mode" @click="selectLineEntryMode('manual')">
              <span class="av indigo" aria-hidden="true">✏️</span>
              <span class="nm">
                <b>Manual table</b>
                <small>Type in the grid or pick from catalog</small>
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
            <div class="chead" style="padding:0; margin-bottom:12px;">
              <div class="right" style="width:100%; display:flex; gap:8px; justify-content:flex-end;">
                <button type="button" class="btn sm" title="Search catalog in the description field (↑↓ Enter)" @click="focusCatalogSearch">From catalog</button>
                <button type="button" class="btn sm primary" @click="addLine">+ Add line</button>
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
                        @typed="onLineDescriptionTyped(line)"
                        @select="applyCatalogToLine(line, $event)"
                      />
                    </td>
                    <td><input v-model="line.quantity" class="num" type="number" step="0.25" min="0"></td>
                    <td><input v-model="line.unitPrice" class="num" type="number" step="0.01" min="0"></td>
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
        </div>
        <div v-if="lineEntryMode" class="ed-sums">
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
      <p v-if="submitError && step === 3" class="help" style="color:#dc2626; margin-top:8px;">{{ submitError }}</p>
      <div class="wiz-foot">
        <button type="button" class="btn" @click="prevFromLinesStep">← Back</button>
        <div class="wiz-foot-right">
          <button type="button" class="btn" :disabled="busy" @click="saveDraft">Save draft</button>
          <button
            type="button"
            class="btn primary"
            :disabled="busy || !lineEntryMode || !canProceedWizardStep(3, { customerId, vehicleId, lines })"
            @click="continueToReview"
          >
            Review invoice →
          </button>
        </div>
      </div>
    </div>

    <!-- Step 4: Review -->
    <div v-show="step === 4" class="wpanel" :class="{ active: step === 4 }">
      <div class="cols">
        <div class="card">
          <div class="chead">
            <h3>Summary</h3>
            <div class="right">
              <span v-if="invoiceNumberFormatted" class="pill draft">Draft · {{ invoiceNumberFormatted }}</span>
            </div>
          </div>
          <dl class="kv">
            <dt>Customer</dt><dd>{{ selectedCustomer?.displayName ?? '—' }}</dd>
            <dt>Vehicle</dt><dd>{{ selectedVehicle ? vehicleTag(selectedVehicle) : '—' }}</dd>
            <dt>Issue / Due</dt>
            <dd>{{ invoiceDateDisplay(invoiceDate) }} → {{ invoiceDateDisplay(dueDate) }}</dd>
            <dt>Line items</dt><dd>{{ validLines.length }}</dd>
            <dt>Total</dt>
            <dd style="color:#4f46e5; font-size:18px">{{ moneyDisplay((savedInvoice ?? previewDraftTotals(lines, { taxExempt: selectedCustomer?.taxExempt })).total) }}</dd>
          </dl>
        </div>
        <div class="stack">
          <div class="card">
            <div class="chead"><h3>Delivery</h3></div>
            <dl class="kv">
              <dt>On finalize</dt><dd>Generate PDF and email the customer</dd>
              <dt>Portal</dt><dd>Visible to customer immediately</dd>
            </dl>
          </div>
          <div class="card">
            <div class="chead"><h3>Workflow</h3></div>
            <div class="cbody" style="font-size:13px; color:#64748b; line-height:1.55;">
              <b style="color:#0f172a">Save draft</b> — keeps your work and assigns an invoice number.<br><br>
              <b style="color:#0f172a">Finalize &amp; send</b> — locks the invoice, generates the PDF, and notifies the customer.
            </div>
          </div>
        </div>
      </div>
      <div class="wiz-foot">
        <button type="button" class="btn" @click="prevStep">← Back</button>
        <div class="wiz-foot-right">
          <button type="button" class="btn" :disabled="busy" @click="saveAndContinueEditing">
            Save draft &amp; view invoice
          </button>
          <button
            type="button"
            class="btn primary"
            :disabled="busy || !invoiceId"
            :title="!canApprove || !canSend ? 'Requires approve and send permissions' : undefined"
            @click="finalizeAndSend"
          >
            Finalize &amp; send
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wiz-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
  flex-wrap: wrap;
  gap: 10px;
}
.wiz-foot-right {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.sl-hint {
  font-size: 13px;
  color: #64748b;
}
</style>
