<script setup lang="ts">
// Invoice creator wizard — customer → vehicle → service log → dates → lines → review.
import AddPackageModal from '~/components/invoices/AddPackageModal.vue'
import InvoiceEditorLinesBlock from '~/components/invoices/InvoiceEditorLinesBlock.vue'
import InvoiceSummaryPanel from '~/components/invoices/InvoiceSummaryPanel.vue'
import { addMoney } from '#shared/money'
import { sumLineDiscounts } from '#shared/invoice-discount'
import { applyCatalogItemToLineFields, editorSummaryRows, type CatalogQuickItem } from '~/utils/invoice-editor-ui'
import {
  buildInvoiceLinePatchBody,
  buildInvoiceWizardSteps,
  canProceedWizardStep,
  createEmptyLine,
  dueDateFromTerms,
  formatInvoiceNumberDisplay,
  formatQuantityField,
  formatUnitPriceField,
  isDraftLineValid,
  previewDraftTotals,
  previewLineTypeBreakdown,
  type DraftLine,
} from '~/utils/invoice-creator-ui'
import {
  auditWhenDisplay,
  paymentTermsLabel,
} from '~/utils/invoices-ui'
import { logNumberDisplay } from '~/utils/service-logs-ui'
import { odoDisplay, vehicleSub, vehicleTag, type VehicleDisplay } from '~/utils/vehicles-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { focusVisibleLineDescription, focusVisibleLineInput } from '~/utils/line-field-focus'
import {
  invoiceWizardStepHint,
  invoiceWizardStepHintClass,
  shouldOfferInvoiceWizardServiceLogUpload,
} from '~/utils/invoice-wizard-ui'
import { useProseField } from '~/composables/useProseField'
import {
  draftLineToWizard,
  wizardLinesToDraftLines,
  applyInferredLineType,
  type WizardLineDraft,
} from '~/utils/line-item-wizard-ui'
import {
  registerSessionSaveHandler,
  unregisterSessionSaveHandler,
} from '~/composables/useSessionLogoutHandlers'
import { isVoiceEntryDevice } from '~/utils/voice-entry-device'
import InvoiceLineAuditModal from '~/components/invoices/InvoiceLineAuditModal.vue'
import InvoiceWizardServiceLogStep from '~/components/invoices/InvoiceWizardServiceLogStep.vue'
import PanelRevealSlider from '~/components/common/PanelRevealSlider.vue'
import ServiceLogPhotoManager from '~/components/service-logs/ServiceLogPhotoManager.vue'
import type { AiSuggestionRow } from '~/utils/ai-ui'
import type { ServiceLogPhotoFile } from '~/composables/useServiceLogPhotoPreviews'
import type { InvoiceLineAuditContent } from '#shared/validators/ai'
import {
  buildLineAuditPassSuggestion,
  isLocalLineAuditPass,
} from '~/utils/invoice-line-audit-ui'

definePageMeta({ layout: 'staff', permission: 'invoices.create.all' })

const { data: invoiceDefaults } = useClientFetch<{
  defaultTaxRatePercent: string
  defaultTaxRateDecimal: string
  shopSuppliesPercent: string
}>('/api/settings/invoice-defaults')

const { data: aiFeatureFlags, pending: aiFeatureFlagsPending } = useClientFetch<{
  enabled: boolean
  serviceLogExtractionEnabled: boolean
  invoiceDescriptionEnabled: boolean
  platformHelpEnabled: boolean
}>('/api/settings/ai-features')

const offerServiceLogUpload = computed(() => shouldOfferInvoiceWizardServiceLogUpload({
  aiEnabled: aiFeatureFlags.value?.enabled,
  serviceLogExtractionEnabled: aiFeatureFlags.value?.serviceLogExtractionEnabled,
}))

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
  discountPercent?: string | null
  total: string
  lineItems: { id: string, lineAmount: string }[]
}

const auth = useAuthStore()

const step = ref(1)
const wizardSteps = computed(() => buildInvoiceWizardSteps(offerServiceLogUpload.value))
const maxWizardStep = computed(() => wizardSteps.value.length)
const stepKey = computed(() => wizardSteps.value.find(s => s.n === step.value)?.key ?? 'customer')
const busy = ref(false)
const pdfPreviewRef = ref<{ refresh: () => Promise<void>, refit: () => void } | null>(null)

const canGeneratePdf = computed(() => auth.can('invoices.generate_pdf.all'))
const canDescribe = computed(() => auth.can('ai.describe.all'))

const auditModalOpen = ref(false)
const auditRequireReview = ref(false)
const auditBusy = ref(false)
const auditError = ref('')
const activeAuditSuggestion = ref<AiSuggestionRow | null>(null)
/** After a successful line audit, continue to review step or finish to invoice view. */
const pendingAfterAudit = ref<'review' | 'finish' | null>(null)
/** True once this draft has completed a line audit (so clean re-continues can skip). */
const lineAuditCompletedForDraft = ref(false)

const invoiceNarrations = computed<Record<number, string>>(() => {
  if (offerServiceLogUpload.value) {
    return {
      1: 'Pick customer.',
      2: 'Pick vehicle.',
      3: 'Upload a service log if you have one.',
      4: 'Set dates and terms.',
      5: 'Add line items.',
      6: 'Preview PDF and save.',
    }
  }
  return {
    1: 'Pick customer.',
    2: 'Pick vehicle.',
    3: 'Set dates and terms.',
    4: 'Add line items.',
    5: 'Preview PDF and save.',
  }
})

const serviceLogStepLabel = ref('')

useWizardStepNarration(step, invoiceNarrations)
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
const serviceLogPhotoFiles = ref<ServiceLogPhotoFile[]>([])
const linesPhotoReveal = ref(50)
const hasWizardServiceLogPhotos = computed(() =>
  Boolean(serviceLogId.value) && serviceLogPhotoFiles.value.length > 0,
)

async function loadServiceLogPhotos(logId: string) {
  if (!logId) {
    serviceLogPhotoFiles.value = []
    return
  }
  try {
    const res = await $fetch<{
      files: Array<{ id: string, originalFilename: string, mimeType: string, fileKind: string }>
    }>(`/api/service-logs/${logId}`)
    serviceLogPhotoFiles.value = (res.files ?? []).filter(f => f.mimeType.startsWith('image/'))
  }
  catch {
    serviceLogPhotoFiles.value = []
  }
}

watch(serviceLogId, (id) => {
  void loadServiceLogPhotos(id)
}, { immediate: true })
const invoiceDate = ref(new Date().toISOString().slice(0, 10))
const dueDate = ref(dueDateFromTerms(new Date().toISOString().slice(0, 10), 'net_30'))
const dueDateManual = ref(false)
const paymentTerms = ref('net_30')
const poNumber = ref('')
const complaint = ref('')

const {
  inputAttrs: complaintInputAttrs,
  onInput: onComplaintInput,
  onBlur: onComplaintBlur,
} = useProseField(complaint, 'prose')

const lines = ref<DraftLine[]>([])
const invoiceDiscountAmount = ref('0')
const invoiceDiscountPercent = ref<string | null>(null)
type LineEntryMode = 'guided' | 'manual' | null
const lineEntryMode = ref<LineEntryMode>(null)
const wizardLines = ref<WizardLineDraft[]>([])
const lineWizardRef = ref<{ openWizard: () => void } | null>(null)
const voiceEntryAvailable = ref(false)

function ensureManualLineEntry() {
  if (voiceEntryAvailable.value || lineEntryMode.value) return
  selectLineEntryMode('manual')
}

watch(stepKey, (key) => {
  if (key === 'lines') {
    ensureManualLineEntry()
    void hydrateLinesFromServiceLog()
  }
})

async function hydrateLinesFromServiceLog() {
  if (!serviceLogId.value || lines.value.some(isDraftLineValid)) return
  try {
    const { log } = await $fetch<{
      log: { draftLineItems?: Array<{
        lineType?: string
        description?: string
        qty?: string | null
        rate?: string | null
        amount?: string | null
      }> | null }
    }>(`/api/service-logs/${serviceLogId.value}`)
    const items = log.draftLineItems ?? []
    if (!items.length) return
    const seeded = items
      .filter(i => (i.description ?? '').trim())
      .map((i) => {
        const line = createEmptyLine()
        line.lineType = (i.lineType === 'part' || i.lineType === 'fee' ? i.lineType : 'labor')
        line.description = (i.description ?? '').trim()
        line.quantity = i.qty?.trim() || '1'
        line.unitPrice = i.rate?.trim() || i.amount?.trim() || '0'
        return line
      })
    if (seeded.length) {
      lines.value = seeded
      if (lineEntryMode.value === 'guided') {
        wizardLines.value = seeded.map(draftLineToWizard)
      }
    }
  }
  catch {
    // Optional hydrate — ignore failures
  }
}

onMounted(() => {
  voiceEntryAvailable.value = isVoiceEntryDevice()
  if (stepKey.value === 'lines') ensureManualLineEntry()
})

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
    serviceLogStepLabel.value = ''
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

watch([customerId, vehicleId, serviceLogId, invoiceDate, dueDate, paymentTerms, poNumber, complaint, lines], () => {
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

function wizardStepHint(stepNumber: number): string {
  return invoiceWizardStepHint({
    step: stepNumber,
    includeServiceLog: offerServiceLogUpload.value,
    customerName: selectedCustomer.value?.displayName,
    vehicle: selectedVehicle.value ?? null,
    serviceLogLabel: serviceLogStepLabel.value
      || (serviceLogId.value ? 'Attached' : ''),
    invoiceDate: invoiceDate.value,
    lines: lines.value,
    taxExempt: selectedCustomer.value?.taxExempt,
    savedTotal: savedInvoice.value?.total ?? null,
    dirty: dirty.value,
    invoiceId: invoiceId.value,
    savedAtLabel: lastSavedAt.value
      ? `Saved ${auditWhenDisplay(lastSavedAt.value.toISOString())}`
      : null,
  })
}

function wizardStepHintClass(stepNumber: number): string {
  return invoiceWizardStepHintClass(stepNumber, {
    step: stepNumber,
    includeServiceLog: offerServiceLogUpload.value,
    dirty: dirty.value,
    invoiceId: invoiceId.value,
  })
}

function wizardCanProceed(stepNumber: number): boolean {
  return canProceedWizardStep(
    stepNumber,
    { customerId: customerId.value, vehicleId: vehicleId.value, lines: lines.value },
    { includeServiceLog: offerServiceLogUpload.value },
  )
}

const summaryRows = computed(() => {
  const breakdown = previewLineTypeBreakdown(lines.value)
  const preview = previewDraftTotals(lines.value, {
    taxExempt: selectedCustomer.value?.taxExempt,
    taxRate: invoiceDefaults.value?.defaultTaxRateDecimal ?? '0',
    discountAmount: invoiceDiscountAmount.value,
    discountPercent: invoiceDiscountPercent.value,
  })
  return editorSummaryRows(preview, {
    breakdown,
    grandLabel: savedInvoice.value ? 'Total' : 'Estimated total',
    lineItems: lines.value.map(line => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxable: line.taxable,
      discountAmount: line.discountAmount,
      discountPercent: line.discountPercent,
    })),
  })
})

const lineDiscountTotal = computed(() => sumLineDiscounts(lines.value.map(line => ({
  quantity: line.quantity,
  unitPrice: line.unitPrice,
  discountAmount: line.discountAmount,
  discountPercent: line.discountPercent,
}))))

const discountBase = computed(() => {
  try {
    const breakdown = previewLineTypeBreakdown(lines.value)
    return addMoney(breakdown.parts, breakdown.labor, breakdown.fees)
  }
  catch {
    return '0'
  }
})

watch(stepKey, async (key) => {
  if (key !== 'review' || !invoiceId.value) return
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
  if (log) {
    vehicleId.value = log.vehicleId
    if (log.complaint && !complaint.value.trim()) {
      complaint.value = log.complaint
    }
  }
}

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
  if (!voiceEntryAvailable.value) {
    if (!lines.value.length) lines.value = [createEmptyLine()]
    lineEntryMode.value = 'manual'
    return
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

function finishServiceLogStep() {
  submitError.value = ''
  nextStep()
}

function onServiceLogAttached(payload: { serviceLogId: string, invoiceNumberFormatted: string | null }) {
  if (payload.serviceLogId) serviceLogId.value = payload.serviceLogId
  if (payload.invoiceNumberFormatted) {
    invoiceNumberFormatted.value = payload.invoiceNumberFormatted
    serviceLogStepLabel.value = payload.invoiceNumberFormatted
  }
  else {
    serviceLogStepLabel.value = 'Attached'
  }
  dirty.value = true
}

async function continueToReview() {
  if (lineEntryMode.value === 'guided') {
    lines.value = wizardLinesToDraftLines(wizardLines.value)
  }
  if (!wizardCanProceed(step.value)) {
    submitError.value = 'Add at least one complete line item.'
    return
  }
  submitError.value = ''
  auditError.value = ''

  // Capture before save — saveDraft clears dirty.
  const needsAudit = dirty.value || !lineAuditCompletedForDraft.value
  pendingAfterAudit.value = 'review'
  const ok = await saveDraft()
  if (!ok) {
    pendingAfterAudit.value = null
    return
  }

  busy.value = true
  try {
    const auditOk = await runLineAuditBeforeSave(needsAudit)
    if (!auditOk) return
    // AI describe off / no lines — advance without modal.
    pendingAfterAudit.value = null
    if (needsAudit) lineAuditCompletedForDraft.value = true
    nextStep()
  }
  finally {
    busy.value = false
  }
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
  line.discountAmount = '0'
  line.discountPercent = null
}

function applyPackageLines(packageLines: ReturnType<typeof applyCatalogItemToLineFields>[]) {
  if (!packageLines.length) return
  const next = packageLines.map(fields => ({
    ...createEmptyLine(),
    lineType: fields.lineType,
    description: fields.description,
    quantity: fields.quantity,
    unitPrice: fields.unitPrice,
    catalogItemId: fields.catalogItemId,
  }))
  lines.value = [...lines.value, ...next]
}

function onLineFieldBlur(line: DraftLine) {
  applyInferredLineType(line)
}

function focusLineQty(localId: string) {
  focusVisibleLineInput(localId, 'quantity')
}

function focusLineRate(localId: string) {
  focusVisibleLineInput(localId, 'rate')
}

function addLineAndFocusDescription() {
  addLine()
  const newest = lines.value[lines.value.length - 1]
  if (newest) focusVisibleLineDescription(newest.localId)
}

function onRateTabNext(line: DraftLine) {
  onLineFieldBlur(line)
  addLineAndFocusDescription()
}

function nextStep() {
  if (step.value < maxWizardStep.value) step.value += 1
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
  invoiceDiscountAmount.value = invoice.discountAmount ?? invoiceDiscountAmount.value
  invoiceDiscountPercent.value = invoice.discountPercent ?? invoiceDiscountPercent.value
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
    complaint: complaint.value.trim() || null,
    discountAmount: invoiceDiscountAmount.value,
    discountPercent: invoiceDiscountPercent.value,
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

async function finishToInvoiceEdit() {
  const id = invoiceId.value
  if (!id) return
  stopEditingSession()
  await navigateTo(`/invoices/${id}/edit`)
}

/**
 * Draft is already staged. Run AI check and ALWAYS open the review modal
 * before advancing — even when every line passes. Returns false while waiting.
 */
async function runLineAuditBeforeSave(forceRun: boolean): Promise<boolean> {
  const id = invoiceId.value
  if (!forceRun || !id || !canDescribe.value || !lines.value.length) return true

  auditBusy.value = true
  auditError.value = ''
  try {
    const res = await $fetch<{
      issuesFound: number
      suggestion: AiSuggestionRow | null
      auditContent: InvoiceLineAuditContent
    }>(`/api/invoices/${id}/line-audit`, {
      method: 'POST',
    })

    activeAuditSuggestion.value = res.suggestion
      ?? buildLineAuditPassSuggestion(res.auditContent)
    auditRequireReview.value = true
    auditModalOpen.value = true
    return false
  }
  catch (e: unknown) {
    // Do not silently skip — surface the failure so Continue cannot proceed without AI.
    submitError.value = syncFetchErrorMessage(e, 'Line audit failed')
    pendingAfterAudit.value = null
    return false
  }
  finally {
    auditBusy.value = false
  }
}

async function completePendingAfterAudit() {
  const pending = pendingAfterAudit.value
  pendingAfterAudit.value = null
  lineAuditCompletedForDraft.value = true
  if (pending === 'finish') {
    await finishToInvoiceEdit()
    return
  }
  if (pending === 'review') {
    await refreshSavedInvoice()
    nextStep()
  }
}

async function submitAuditReview(decisions: Array<{ lineItemId: string, action: 'accept' | 'reject' }>) {
  const id = invoiceId.value
  if (!id || !activeAuditSuggestion.value) return
  auditBusy.value = true
  auditError.value = ''
  try {
    if (!isLocalLineAuditPass(activeAuditSuggestion.value)) {
      await $fetch(`/api/invoices/${id}/line-audit/review`, {
        method: 'POST',
        body: {
          suggestionId: activeAuditSuggestion.value.id,
          decisions,
        },
      })
      await refreshSavedInvoice()
    }

    auditModalOpen.value = false
    auditRequireReview.value = false
    await completePendingAfterAudit()
  }
  catch (e: unknown) {
    auditError.value = syncFetchErrorMessage(e, 'Could not apply audit changes')
  }
  finally {
    auditBusy.value = false
  }
}

function closeAuditModal() {
  auditModalOpen.value = false
  auditRequireReview.value = false
  pendingAfterAudit.value = null
}

async function saveDraftAndFinish() {
  const needsAudit = dirty.value || !lineAuditCompletedForDraft.value
  pendingAfterAudit.value = 'finish'
  const ok = await saveDraft()
  if (!ok) {
    pendingAfterAudit.value = null
    return
  }

  busy.value = true
  try {
    const auditOk = await runLineAuditBeforeSave(needsAudit)
    if (!auditOk) return
    // If AI describe is off, finalize immediately (no modal).
    pendingAfterAudit.value = null
    await finishToInvoiceEdit()
  }
  finally {
    busy.value = false
  }
}

async function saveOpenWorkForSessionTimeout() {
  if (!customerId.value) return
  await saveDraft()
}

onMounted(() => registerSessionSaveHandler(saveOpenWorkForSessionTimeout))
onBeforeUnmount(() => unregisterSessionSaveHandler(saveOpenWorkForSessionTimeout))


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

    <div class="inv-wizard-progress">
      <div
        class="sl-progress inv-wizard-steps"
        aria-label="Progress"
        :style="{ '--inv-wizard-cols': wizardSteps.length }"
      >
        <div
          v-for="s in wizardSteps"
          :key="s.key"
          class="sl-step"
          :class="{ on: step === s.n, done: step > s.n }"
        >
          <div class="dot">{{ s.n }}</div>
          <span class="sl-step-label">{{ s.label }}</span>
          <span
            v-if="wizardStepHint(s.n)"
            class="sl-step-sub"
            :class="wizardStepHintClass(s.n)"
          >{{ wizardStepHint(s.n) }}</span>
        </div>
      </div>
    </div>

    <p v-if="submitError" class="help inv-wizard-error">{{ submitError }}</p>

    <!-- Step: Customer -->
    <div v-show="stepKey === 'customer'" class="sl-panel active">
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
          :disabled="!wizardCanProceed(1)"
          @click="nextStep"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step: Vehicle -->
    <div v-show="stepKey === 'vehicle'" class="sl-panel active">
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
          :disabled="aiFeatureFlagsPending || !wizardCanProceed(2)"
          @click="nextStep"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step: Service log upload (when AI extraction is on) -->
    <div v-show="stepKey === 'service_log'" class="sl-panel active">
      <InvoiceWizardServiceLogStep
        v-if="offerServiceLogUpload"
        :open="stepKey === 'service_log'"
        :customer-id="customerId"
        :vehicle-id="vehicleId"
        :invoice-id="invoiceId"
        :invoice-number-formatted="invoiceNumberFormatted"
        :service-log-id="serviceLogId"
        :service-date="invoiceDate"
        :ensure-draft="ensureDraft"
        @update:service-log-id="serviceLogId = $event"
        @attached="onServiceLogAttached"
        @done="finishServiceLogStep"
        @back="prevStep"
      />
    </div>

    <!-- Step: Dates & terms -->
    <div v-show="stepKey === 'dates'" class="sl-panel active">
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
          :disabled="!wizardCanProceed(step)"
          @click="nextStep"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step: Line items -->
    <div v-show="stepKey === 'lines'" class="sl-panel active">
      <h3>{{ hasWizardServiceLogPhotos ? 'Line items · Service Log' : 'Line items' }}</h3>

      <label class="fld inv-wizard-complaint">
        <span>Customer complaint / symptoms</span>
        <textarea
          :value="complaint"
          rows="3"
          placeholder="What the customer reported — printed on invoice PDF"
          v-bind="complaintInputAttrs"
          @input="onComplaintInput"
          @blur="onComplaintBlur"
        />
        <span class="help">Shown on customer-facing PDF under Symptoms / Complaints</span>
      </label>

      <p v-if="!lineEntryMode && voiceEntryAvailable" class="sl-hint">How do you want to add charges?</p>

      <div v-if="!lineEntryMode && voiceEntryAvailable" class="sl-picks sl-log-modes">
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

      <PanelRevealSlider
        v-else-if="hasWizardServiceLogPhotos && lineEntryMode"
        v-model="linesPhotoReveal"
        reveal-label="Service Log"
        base-label="Line items"
        min-height="520px"
        class="inv-wizard-reveal"
      >
        <template #reveal>
          <ServiceLogPhotoManager
            :service-log-id="serviceLogId"
            :files="serviceLogPhotoFiles"
          />
        </template>
        <template #base>
          <div v-if="lineEntryMode === 'guided'" class="inv-guided-lines">
            <CommonLineItemWizard
              ref="lineWizardRef"
              v-model:lines="wizardLines"
            />
            <button v-if="voiceEntryAvailable" type="button" class="btn ghost sm sl-change-mode" @click="clearLineEntryMode">Change method</button>
          </div>

          <div v-else class="inv-line-editor inv-line-editor--reveal">
            <div class="inv-line-actions" style="display:flex; gap:8px; flex-wrap:nowrap; margin-bottom:12px; justify-content:flex-end;">
              <AddPackageModal @applied="applyPackageLines" />
              <button type="button" class="btn sm primary" @click="addLine">+ Add line</button>
            </div>
            <InvoiceEditorLinesBlock
              v-model:discount-amount="invoiceDiscountAmount"
              v-model:discount-percent="invoiceDiscountPercent"
              :lines="lines"
              :editable="true"
              :summary-rows="summaryRows"
              :show-mobile-cards="true"
              :show-summary="false"
              :discount-editable="true"
              :discount-base="discountBase"
              @patch="onLineFieldBlur"
              @remove="removeLine"
              @focus-qty="focusLineQty"
              @focus-rate="focusLineRate"
              @rate-tab-next="onRateTabNext"
              @catalog-select="applyCatalogToLine"
            />
            <button v-if="voiceEntryAvailable" type="button" class="btn ghost sm sl-change-mode" @click="clearLineEntryMode">Change method</button>
          </div>

          <InvoiceSummaryPanel
            v-model:discount-amount="invoiceDiscountAmount"
            v-model:discount-percent="invoiceDiscountPercent"
            class="inv-wizard-sums"
            :rows="summaryRows"
            :discount-editable="true"
            :discount-base="discountBase"
            :line-discount-total="lineDiscountTotal"
          />
        </template>
      </PanelRevealSlider>

      <div v-else-if="lineEntryMode === 'guided'" class="card inv-line-editor">
        <div class="cbody inv-guided-lines">
          <CommonLineItemWizard
            ref="lineWizardRef"
            v-model:lines="wizardLines"
          />
          <button v-if="voiceEntryAvailable" type="button" class="btn ghost sm sl-change-mode" @click="clearLineEntryMode">Change method</button>
        </div>
      </div>

      <template v-else-if="lineEntryMode === 'manual'">
        <div class="card inv-line-editor">
          <div class="chead inv-line-editor-head">
            <div class="right inv-line-actions">
              <AddPackageModal @applied="applyPackageLines" />
              <button type="button" class="btn sm primary" @click="addLine">+ Add line</button>
            </div>
          </div>
          <div class="cbody">
            <InvoiceEditorLinesBlock
              v-model:discount-amount="invoiceDiscountAmount"
              v-model:discount-percent="invoiceDiscountPercent"
              :lines="lines"
              :editable="true"
              :summary-rows="summaryRows"
              :show-mobile-cards="true"
              :show-summary="false"
              :discount-editable="true"
              :discount-base="discountBase"
              @patch="onLineFieldBlur"
              @remove="removeLine"
              @focus-qty="focusLineQty"
              @focus-rate="focusLineRate"
              @rate-tab-next="onRateTabNext"
              @catalog-select="applyCatalogToLine"
            />
          <button v-if="voiceEntryAvailable" type="button" class="btn ghost sm sl-change-mode" @click="clearLineEntryMode">Change method</button>
          </div>
        </div>
      </template>

      <InvoiceSummaryPanel
        v-if="lineEntryMode && !hasWizardServiceLogPhotos"
        v-model:discount-amount="invoiceDiscountAmount"
        v-model:discount-percent="invoiceDiscountPercent"
        class="inv-wizard-sums"
        :rows="summaryRows"
        :discount-editable="true"
        :discount-base="discountBase"
        :line-discount-total="lineDiscountTotal"
      />

      <div class="sl-foot">
        <button type="button" class="btn" @click="prevFromLinesStep">Back</button>
        <button
          type="button"
          class="btn primary"
          :disabled="busy || auditBusy || !lineEntryMode || !wizardCanProceed(step)"
          @click="continueToReview"
        >
          {{ auditBusy ? 'Checking lines…' : busy ? 'Saving…' : 'Continue' }}
        </button>
      </div>
      <p v-if="stepKey === 'lines' && (submitError || auditError)" class="help" style="color:#dc2626;">{{ submitError || auditError }}</p>
    </div>

    <!-- Step: Review -->
    <div v-show="stepKey === 'review'" class="sl-panel active inv-wizard-review">
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
          :disabled="busy || auditBusy || !invoiceId"
          @click="saveDraftAndFinish"
        >
          {{ auditBusy ? 'Checking lines…' : busy ? 'Saving…' : 'Save draft' }}
        </button>
      </div>
      <p v-if="auditError" class="help" style="color:#dc2626;">{{ auditError }}</p>
    </div>

    <InvoiceLineAuditModal
      :open="auditModalOpen"
      :suggestion="activeAuditSuggestion"
      :busy="auditBusy"
      :require-review="auditRequireReview"
      @close="closeAuditModal"
      @submit="submitAuditReview"
    />
  </section>
</template>

<style scoped>
.inv-wizard-progress {
  margin-bottom: 20px;
}

.inv-wizard-steps {
  display: grid;
  grid-template-columns: repeat(var(--inv-wizard-cols, 5), minmax(0, 1fr));
  gap: 8px 6px;
  overflow: visible;
  margin-bottom: 0;
  padding-bottom: 0;
}

.inv-wizard-steps .sl-step {
  flex: none;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  line-height: 1.25;
}

.inv-wizard-steps .sl-step-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.inv-wizard-steps .sl-step-sub {
  margin-top: 6px;
  width: 100%;
  min-height: 1.25em;
  padding: 0 2px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inv-wizard-steps .sl-step-sub.pending {
  color: #d97706;
}

.inv-wizard-steps .sl-step-sub.saved {
  color: #059669;
}

.inv-wizard-steps .sl-step.done .sl-step-sub:not(.pending) {
  color: #059669;
}

.inv-wizard-complaint {
  margin: 0 0 18px;
}

.inv-wizard-complaint textarea {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font: inherit;
  font-size: 16px;
  padding: 10px 12px;
  background: #f8fafc;
  color: #0f172a;
  resize: vertical;
  min-height: 84px;
}

.inv-wizard-complaint textarea:focus {
  outline: none;
  border-color: #a5b4fc;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
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

.inv-wizard-sums {
  margin-top: 16px;
  border-radius: 12px;
  overflow: hidden;
}
</style>
