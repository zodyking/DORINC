<script setup lang="ts">
// Invoice editor — catalog picker, line editor, server totals, editing session lock (mockup: PAGE: INVOICE EDITOR / P1-24).
import CatalogLineAutocomplete from '~/components/invoices/CatalogLineAutocomplete.vue'
import AddPackageModal from '~/components/invoices/AddPackageModal.vue'
import LineCurrencyInput from '~/components/invoices/LineCurrencyInput.vue'
import LineQuantityInput from '~/components/invoices/LineQuantityInput.vue'
import { isEditingSessionNoise } from '#shared/audit-messages'
import {
  applyCatalogItemToLineFields,
  autosavedLabel,
  customerTermsHelp,
  editorSummaryRows,
  formatHistoryChange,
  type CatalogQuickItem,
} from '~/utils/invoice-editor-ui'
import {
  buildInvoiceLinePatchBody,
  dueDateFromTerms,
  formatQuantityField,
  formatUnitPriceField,
  isDraftLineValid,
  LINE_TYPE_OPTIONS,
  previewLineAmount,
  previewLineTypeBreakdown,
} from '~/utils/invoice-creator-ui'
import {
  auditWhenDisplay,
  invoiceDateDisplay,
  invoiceStatusPill,
  isInvoiceEditable,
  moneyDisplay,
  type InvoiceLineType,
  type InvoiceStatus,
} from '~/utils/invoices-ui'
import { logNumberDisplay } from '~/utils/service-logs-ui'
import { odoDisplay, vehicleSub, vehicleUnitLine, type VehicleDisplay } from '~/utils/vehicles-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { focusVisibleLineDescription, focusVisibleLineInput } from '~/utils/line-field-focus'
import { useProseField } from '~/composables/useProseField'
import {
  registerSessionSaveHandler,
  unregisterSessionSaveHandler,
} from '~/composables/useSessionLogoutHandlers'
import ServiceLogPhotoManager from '~/components/service-logs/ServiceLogPhotoManager.vue'
import InvoiceLineAuditModal from '~/components/invoices/InvoiceLineAuditModal.vue'
import type { AiSuggestionRow } from '~/utils/ai-ui'
import {
  latestLineAuditSuggestion,
  shouldRunLineAuditBeforeSave,
  shouldSkipLineAuditError,
} from '~/utils/invoice-line-audit-ui'
import { isMessageLinkRoute, messageLinkFetchQuery } from '~/utils/message-link-access'

definePageMeta({ layout: 'staff' })

interface LineItem {
  id: string
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  lineAmount: string
  taxable?: boolean
  catalogItemId?: string | null
}

interface InvoicePayload {
  id: string
  invoiceNumberFormatted: string
  status: string
  creationSource?: string | null
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
  taxRate?: string | null
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
  changedFields?: string[] | null
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  createdAt: string
}

interface VehiclePick extends VehicleDisplay {
  id: string
  vin: string | null
  odometer: string | null
  odometerUnit: string
}

interface CustomerPick {
  id: string
  displayName: string
  accountKind: string
  paymentTerms: string
}

const route = useRoute()
const auth = useAuthStore()
const isMessageLink = computed(() => isMessageLinkRoute(route.query))
const canLoadEditor = computed(() =>
  auth.can('invoices.read.all')
  || (isMessageLink.value && (auth.can('invoices.update.all') || auth.can('invoices.create.all'))),
)
const editorLink = { path: '/templates/designer' }
const id = route.params.id as string

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const idValid = computed(() => UUID_RE.test(id))

const {
  lockedByOther,
  loading: sessionLoading,
  canEdit,
  error: sessionError,
  acquire: acquireEditSession,
  release: releaseEditSession,
} = useEditingSession('invoice', id)

// Client-only — do not await (Suspense blank) and do not fetch during SSR
// (server:false refresh on the server never completes, leaving pending stuck after hydrate).
const { data, refresh, error, pending } = useClientFetch<{ invoice: InvoicePayload, history: HistoryRow[] }>(
  () => (idValid.value && canLoadEditor.value ? `/api/invoices/${id}` : null),
  {
    immediate: false,
    watch: false,
    query: computed(() => messageLinkFetchQuery(route.query)),
  },
)

function loadInvoiceEditor() {
  if (!import.meta.client) return
  if (!auth.loaded || !canLoadEditor.value) return
  if (!idValid.value) return
  void refresh()
}

onMounted(() => {
  loadInvoiceEditor()
  if (canDescribe.value && idValid.value) void refreshAuditReport()
})

watch([() => auth.loaded, canLoadEditor, idValid], () => {
  loadInvoiceEditor()
})

const invoice = computed(() => data.value?.invoice)
const history = computed(() =>
  (data.value?.history ?? []).filter(row => !isEditingSessionNoise(row.action)),
)
const isEditable = computed(() =>
  invoice.value ? isInvoiceEditable(invoice.value.status as InvoiceStatus) : false,
)

const loadErrorMessage = computed(() => {
  if (!idValid.value) return 'This invoice link is invalid.'
  const msg = (error.value as { data?: { message?: string } } | null)?.data?.message
  if (msg) return msg
  if (error.value) return 'Invoice not found or you do not have access.'
  return null
})

const activeTab = ref<'invoice' | 'servicelog' | 'pdf'>('invoice')
const pdfPreviewRef = ref<{ refresh: () => Promise<void>, refit: () => void } | null>(null)

watch(activeTab, async (tab) => {
  if (tab === 'pdf') {
    await nextTick()
    pdfPreviewRef.value?.refit()
  }
})

const vehicleId = ref('')
const customerId = ref('')
const invoiceDate = ref('')
const dueDate = ref('')
const paymentTerms = ref('net_30')
const poNumber = ref('')
const complaint = ref('')
const internalNotes = ref('')
const lines = ref<LineItem[]>([])

const {
  inputAttrs: complaintInputAttrs,
  onInput: onComplaintInput,
  onBlur: onComplaintBlur,
} = useProseField(complaint, 'prose')

async function onComplaintFieldBlur() {
  onComplaintBlur()
  await patchHeader()
}

function focusLineQty(lineId: string) {
  focusVisibleLineInput(lineId, 'quantity')
}

function focusLineRate(lineId: string) {
  focusVisibleLineInput(lineId, 'rate')
}

async function onLineRateTabNext(line: LineItem) {
  await patchLine(line, { refreshAfter: false })
  if (!editable.value) return
  await addEmptyLine()
  const newest = lines.value[lines.value.length - 1]
  if (newest) focusVisibleLineDescription(newest.id)
}

const busy = ref(false)
const saveError = ref('')
const lastSavedAt = ref<Date | null>(null)
const autosaveTick = ref(0)

const canUpdate = computed(() => auth.can('invoices.update.all'))
const canDescribe = computed(() => auth.can('ai.describe.all'))
const saveButtonLabel = computed(() => {
  if (auditBusy.value) return 'Checking lines…'
  if (busy.value) return 'Saving…'
  return 'Save invoice'
})
const canGeneratePdf = computed(() => auth.can('invoices.generate_pdf.all'))
const removableInvoice = computed(() =>
  invoice.value && invoice.value.status !== 'void' && invoice.value.status !== 'paid',
)
const editable = computed(() => canUpdate.value && canEdit.value && isEditable.value)

const pill = computed(() => {
  if (!invoice.value) return { cls: 'pill gray', label: '—' }
  return invoiceStatusPill(invoice.value.status as 'draft', invoice.value.dueDate, '0')
})

const summaryRows = computed(() => {
  if (!invoice.value) return []
  const lineInputs = lines.value.map(line => ({
    lineType: line.lineType,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineAmount: line.lineAmount,
  }))
  const breakdown = previewLineTypeBreakdown(lineInputs)
  return editorSummaryRows(invoice.value, {
    breakdown,
    lineItems: lines.value.map(line => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxable: line.taxable,
    })),
  })
})

const autosaveText = computed(() => {
  void autosaveTick.value
  return autosavedLabel(lastSavedAt.value)
})

const { data: customersData, pending: customersPending } = useClientFetch<{ items: CustomerPick[] }>(
  '/api/customers',
  {
    query: computed(() => ({
      pageSize: 100,
      sort: 'name-asc' as const,
    })),
  },
)

function customerPickFromInvoice(inv: InvoicePayload): CustomerPick {
  return {
    id: inv.customerId,
    displayName: inv.customerName,
    accountKind: 'fleet',
    paymentTerms: inv.customerSnapshot?.paymentTerms ?? inv.paymentTerms,
  }
}

const customerOptions = computed(() => {
  const fromApi = customersData.value?.items ?? []
  const merged = new Map<string, CustomerPick>()
  for (const c of fromApi) merged.set(c.id, c)
  const inv = invoice.value
  if (inv?.customerId && !merged.has(inv.customerId)) {
    merged.set(inv.customerId, customerPickFromInvoice(inv))
  }
  if (customerId.value && !merged.has(customerId.value) && inv?.customerId === customerId.value) {
    merged.set(customerId.value, customerPickFromInvoice(inv))
  }
  return [...merged.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
})

const selectedCustomer = computed(() =>
  customerOptions.value.find(c => c.id === customerId.value) ?? null,
)

const { data: vehiclesData, pending: vehiclesPending } = useClientFetch<{ items: VehiclePick[] }>(
  '/api/vehicles',
  {
    query: computed(() => ({ customerId: customerId.value || undefined, pageSize: 100, sort: 'tag-asc' as const })),
    watch: [customerId],
  },
)

function vehiclePickFromSnapshot(vehicleIdValue: string, snap: NonNullable<InvoicePayload['vehicleSnapshot']>): VehiclePick {
  return {
    id: vehicleIdValue,
    unitType: snap.unitType,
    busNumber: snap.busNumber,
    unitTag: snap.unitTag,
    year: snap.year,
    make: snap.make,
    model: snap.model,
    trim: null,
    vin: snap.vin ?? null,
    odometer: snap.odometer ?? null,
    odometerUnit: snap.odometerUnit ?? 'miles',
  }
}

const vehicleOptions = computed(() => {
  const fromApi = vehiclesData.value?.items ?? []
  const vid = vehicleId.value
  const inv = invoice.value
  if (!vid || fromApi.some(v => v.id === vid)) return fromApi
  if (inv?.vehicleSnapshot && inv.vehicleId === vid) {
    return [vehiclePickFromSnapshot(vid, inv.vehicleSnapshot), ...fromApi]
  }
  return fromApi
})

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

const serviceLogId = computed(() => invoice.value?.serviceLogId ?? null)

const { data: serviceLogData } = useClientFetch<{
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
  files: { id: string, originalFilename: string, mimeType: string, fileKind: string }[]
}>(
  () => (serviceLogId.value ? `/api/service-logs/${serviceLogId.value}` : null),
  { watch: [serviceLogId] },
)

const serviceLogImages = computed(() =>
  (serviceLogData.value?.files ?? []).filter(f => f.mimeType.startsWith('image/')),
)
const hasServiceLogPhotos = computed(() => !!serviceLogId.value && serviceLogImages.value.length > 0)

const hydratingFromServer = ref(false)
const savedFormSnapshot = ref<string | null>(null)

function buildFormSnapshot(): string {
  return JSON.stringify({
    customerId: customerId.value,
    vehicleId: vehicleId.value,
    invoiceDate: invoiceDate.value,
    dueDate: dueDate.value,
    paymentTerms: paymentTerms.value,
    poNumber: poNumber.value,
    complaint: complaint.value,
    internalNotes: internalNotes.value,
    lines: lines.value.map(line => ({
      id: line.id,
      lineType: line.lineType,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxable: line.taxable,
      catalogItemId: line.catalogItemId ?? null,
    })),
  })
}

function markFormClean() {
  savedFormSnapshot.value = buildFormSnapshot()
}

const isDirty = computed(() => {
  if (savedFormSnapshot.value === null) return false
  return buildFormSnapshot() !== savedFormSnapshot.value
})

const historyActions = computed(() => history.value.map(row => row.action))

function shouldAuditOnThisSave(dirtyOverride?: boolean): boolean {
  if (!invoice.value) return false
  return shouldRunLineAuditBeforeSave({
    isDirty: dirtyOverride ?? isDirty.value,
    historyActions: historyActions.value,
  })
}

function syncFormFromInvoice(inv: InvoicePayload) {
  customerId.value = inv.customerId
  vehicleId.value = inv.vehicleId ?? ''
  invoiceDate.value = inv.invoiceDate
  dueDate.value = inv.dueDate ?? dueDateFromTerms(inv.invoiceDate, inv.paymentTerms)
  paymentTerms.value = inv.paymentTerms
  poNumber.value = inv.poNumber ?? ''
  complaint.value = inv.complaint ?? ''
  internalNotes.value = inv.internalNotes ?? ''
  lines.value = inv.lineItems.map(l => ({ ...l }))
}

watch(invoice, (inv) => {
  if (!inv || hydratingFromServer.value) return
  syncFormFromInvoice(inv)
  if (savedFormSnapshot.value === null) {
    nextTick(() => markFormClean())
  }
}, { immediate: true })

watch(paymentTerms, (terms) => {
  if (hydratingFromServer.value || !editable.value) return
  dueDate.value = dueDateFromTerms(invoiceDate.value, terms)
})

if (import.meta.client) {
  const tick = setInterval(() => { autosaveTick.value += 1 }, 5000)
  onBeforeUnmount(() => clearInterval(tick))
}

async function refreshInvoice() {
  hydratingFromServer.value = true
  try {
    await refresh()
    lastSavedAt.value = new Date()
    await pdfPreviewRef.value?.refresh()
  }
  finally {
    await nextTick()
    hydratingFromServer.value = false
    if (invoice.value) syncFormFromInvoice(invoice.value)
  }
}

async function patchHeader(opts: { refreshAfter?: boolean, manageBusy?: boolean } = {}) {
  const { refreshAfter = true, manageBusy = true } = opts
  if (!editable.value || !invoice.value) return
  if (manageBusy) {
    busy.value = true
    saveError.value = ''
  }
  try {
    await $fetch(`/api/invoices/${id}`, {
      method: 'PATCH',
      body: {
        customerId: customerId.value,
        vehicleId: vehicleId.value || null,
        invoiceDate: invoiceDate.value,
        dueDate: dueDate.value || null,
        paymentTerms: paymentTerms.value,
        poNumber: poNumber.value || null,
        complaint: complaint.value || null,
        internalNotes: internalNotes.value || null,
      },
    })
    if (refreshAfter) await refreshInvoice()
  }
  catch (e: unknown) {
    saveError.value = syncFetchErrorMessage(e, 'Save failed')
    if (manageBusy) throw e
  }
  finally {
    if (manageBusy) busy.value = false
  }
}

async function syncInvoiceDraftToServer() {
  for (const line of lines.value) {
    if (!isDraftLineValid(line)) continue
    await patchLine(line, { refreshAfter: false, manageBusy: false })
  }
  await patchHeader({ refreshAfter: false, manageBusy: false })
}

async function completeSave() {
  await refreshInvoice()
  markFormClean()
  await releaseEditSession()
  await navigateTo(`/invoices/${id}`)
}

async function saveInvoice() {
  if (!editable.value || !invoice.value) return
  // Capture before sync — sync can normalize line fields and confuse dirty checks.
  const dirtyAtSave = isDirty.value
  const needsAudit = shouldAuditOnThisSave(dirtyAtSave)
  busy.value = true
  saveError.value = ''
  savePendingAfterAudit.value = true
  try {
    await syncInvoiceDraftToServer()
    const auditOk = await runLineAuditBeforeSave(needsAudit)
    if (!auditOk) return
    savePendingAfterAudit.value = false
    await completeSave()
  }
  catch (e: unknown) {
    savePendingAfterAudit.value = false
    if (!saveError.value) {
      saveError.value = syncFetchErrorMessage(e, 'Save failed')
    }
  }
  finally {
    busy.value = false
  }
}

async function saveOpenWorkForSessionTimeout() {
  if (!editable.value || !invoice.value) return
  for (const line of lines.value) {
    if (!isDraftLineValid(line)) continue
    await patchLine(line, { refreshAfter: false, manageBusy: false })
  }
  await patchHeader({ refreshAfter: false, manageBusy: false })
}

onMounted(() => registerSessionSaveHandler(saveOpenWorkForSessionTimeout))
onBeforeUnmount(() => unregisterSessionSaveHandler(saveOpenWorkForSessionTimeout))

async function onCustomerChange() {
  if (!editable.value) return
  vehicleId.value = ''
  if (selectedCustomer.value?.paymentTerms) {
    paymentTerms.value = selectedCustomer.value.paymentTerms
    dueDate.value = dueDateFromTerms(invoiceDate.value, paymentTerms.value)
  }
  await patchHeader()
}

async function patchLine(
  line: LineItem,
  opts: { catalogItemId?: string | null, refreshAfter?: boolean, manageBusy?: boolean } = {},
) {
  const { refreshAfter = true, manageBusy = true } = opts
  if (!editable.value) return
  const body = buildInvoiceLinePatchBody(line, opts)
  if (!body) return

  const quantity = formatQuantityField(line.quantity)
  const unitPrice = formatUnitPriceField(line.unitPrice)
  if (quantity) line.quantity = quantity
  if (unitPrice !== null) line.unitPrice = unitPrice

  if (manageBusy) {
    busy.value = true
    saveError.value = ''
  }
  try {
    await $fetch(`/api/invoices/${id}/line-items/${line.id}`, {
      method: 'PATCH',
      body,
    })
    if (refreshAfter) await refreshInvoice()
  }
  catch (e: unknown) {
    saveError.value = syncFetchErrorMessage(e, 'Line update failed')
    if (!manageBusy) throw e
  }
  finally {
    if (manageBusy) busy.value = false
  }
}

async function applyCatalogToExistingLine(line: LineItem, item: CatalogQuickItem) {
  if (!editable.value) return
  const fields = applyCatalogItemToLineFields(item)
  line.lineType = fields.lineType
  line.description = fields.description
  line.quantity = fields.quantity
  line.unitPrice = fields.unitPrice
  line.catalogItemId = fields.catalogItemId
  await patchLine(line, { catalogItemId: fields.catalogItemId })
}

async function addEmptyLine() {
  if (!editable.value) return
  busy.value = true
  saveError.value = ''
  try {
    const { line } = await $fetch<{ line: LineItem }>(`/api/invoices/${id}/line-items`, {
      method: 'POST',
      body: {
        lineType: 'labor',
        description: 'New line item',
        quantity: '1',
        unitPrice: '0',
        sortOrder: lines.value.length,
      },
    })
    lines.value = [...lines.value, { ...line }]
    void refreshInvoice()
  }
  catch (e: unknown) {
    const err = e as { data?: { code?: string, message?: string } }
    if (err.data?.code === 'EDIT_SESSION_ACTIVE' && err.data?.message?.includes('locked')) {
      await acquireEditSession()
    }
    saveError.value = syncFetchErrorMessage(e, 'Could not add line')
  }
  finally {
    busy.value = false
  }
}

async function applyPackageLines(packageLines: ReturnType<typeof applyCatalogItemToLineFields>[]) {
  if (!editable.value || !packageLines.length) return
  busy.value = true
  saveError.value = ''
  try {
    const created: LineItem[] = []
    let sortOrder = lines.value.length
    for (const fields of packageLines) {
      const { line } = await $fetch<{ line: LineItem }>(`/api/invoices/${id}/line-items`, {
        method: 'POST',
        body: {
          lineType: fields.lineType,
          description: fields.description,
          quantity: fields.quantity,
          unitPrice: fields.unitPrice,
          catalogItemId: fields.catalogItemId,
          sortOrder: sortOrder++,
        },
      })
      created.push(line)
    }
    lines.value = [...lines.value, ...created]
    void refreshInvoice()
  }
  catch (e: unknown) {
    saveError.value = syncFetchErrorMessage(e, 'Could not add package lines')
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
    lines.value = lines.value.filter(line => line.id !== lineId)
    void refreshInvoice()
  }
  catch (e: unknown) {
    saveError.value = syncFetchErrorMessage(e, 'Could not remove line')
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

const selectedLineId = ref<string | null>(null)
const auditModalOpen = ref(false)
const auditRequireReview = ref(false)
const auditBusy = ref(false)
const auditError = ref('')
const savePendingAfterAudit = ref(false)
const activeAuditSuggestion = ref<AiSuggestionRow | null>(null)

const { data: invoiceAiData, refresh: refreshInvoiceAi } = useClientFetch<{ suggestions: AiSuggestionRow[] }>(
  () => (idValid.value ? `/api/invoices/${id}/ai-suggestions` : null),
  { immediate: false, watch: false },
)

const invoiceAiSuggestions = computed(() => invoiceAiData.value?.suggestions ?? [])

const latestAuditSuggestion = computed(() =>
  latestLineAuditSuggestion(invoiceAiSuggestions.value),
)

async function refreshAuditReport() {
  await refreshInvoiceAi()
  activeAuditSuggestion.value = latestAuditSuggestion.value
}

async function runLineAuditBeforeSave(forceRun: boolean): Promise<boolean> {
  auditError.value = ''

  if (!canDescribe.value || !lines.value.length) return true
  if (!forceRun) return true

  auditBusy.value = true
  try {
    const res = await $fetch<{
      issuesFound: number
      suggestion: AiSuggestionRow | null
    }>(`/api/invoices/${id}/line-audit`, {
      method: 'POST',
    })

    if (res.suggestion && res.issuesFound > 0) {
      activeAuditSuggestion.value = res.suggestion
      auditRequireReview.value = true
      auditModalOpen.value = true
      return false
    }

    return true
  }
  catch (e: unknown) {
    if (shouldSkipLineAuditError(e)) {
      return true
    }
    saveError.value = syncFetchErrorMessage(e, 'Line audit failed')
    return false
  }
  finally {
    auditBusy.value = false
  }
}

async function openAuditReport() {
  auditError.value = ''
  auditRequireReview.value = false
  await refreshAuditReport()
  if (!activeAuditSuggestion.value) {
    auditError.value = 'No audit report yet — save the invoice to run a line-item check.'
  }
  auditModalOpen.value = true
}

async function submitAuditReview(decisions: Array<{ lineItemId: string, action: 'accept' | 'reject' }>) {
  if (!activeAuditSuggestion.value) return
  auditBusy.value = true
  auditError.value = ''
  try {
    await $fetch(`/api/invoices/${id}/line-audit/review`, {
      method: 'POST',
      body: {
        suggestionId: activeAuditSuggestion.value.id,
        decisions,
      },
    })
    auditModalOpen.value = false
    auditRequireReview.value = false
    await Promise.all([refreshInvoice(), refreshAuditReport()])

    if (savePendingAfterAudit.value) {
      savePendingAfterAudit.value = false
      await completeSave()
    }
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
  savePendingAfterAudit.value = false
}

function onAiKeydown(e: KeyboardEvent) {
  if (!editable.value || !canDescribe.value) return
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    void openAuditReport()
  }
}

if (import.meta.client) {
  window.addEventListener('keydown', onAiKeydown)
  onBeforeUnmount(() => window.removeEventListener('keydown', onAiKeydown))
}
</script>

<template>
  <section class="page active">
    <div v-if="!auth.loaded || (pending && !invoice && !loadErrorMessage)" class="cp-state">Loading invoice…</div>

    <div v-else-if="loadErrorMessage" class="card" style="padding:24px;">
      <p style="margin:0 0 12px; color:#dc2626;">{{ loadErrorMessage }}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button v-if="idValid" type="button" class="btn" @click="refresh()">Retry</button>
        <NuxtLink to="/invoices" class="btn primary">Back to invoices</NuxtLink>
      </div>
    </div>

    <template v-else-if="invoice">
      <StaffPageHead>
        <template #title>
          Invoice Editor
          <span :class="pill.cls" style="vertical-align:3px">{{ pill.label }} · {{ invoice.invoiceNumberFormatted }}</span>
        </template>
        <template #subtitle>
          <NuxtLink to="/invoices">Invoices</NuxtLink>
          / <NuxtLink :to="`/invoices/${id}`">{{ invoice.invoiceNumberFormatted }}</NuxtLink>
          · {{ autosaveText }}
        </template>
        <template #actions>
          <NuxtLink :to="editorLink" class="btn">Template editor</NuxtLink>
          <InvoicePdfActions
            :invoice-id="id"
            :invoice-label="invoice.invoiceNumberFormatted"
            :allow-official-download="['sent', 'paid'].includes(invoice.status)"
            :can-generate-pdf="auth.can('invoices.generate_pdf.all')"
          />
          <ReassignEntityButton
            v-if="invoice.status !== 'void'"
            entity-type="invoice"
            :entity-id="id"
            :entity-label="invoice.invoiceNumberFormatted"
            :current-customer-id="invoice.customerId"
            :current-customer-name="invoice.customerName"
            :current-vehicle-id="invoice.vehicleId"
            :disabled="busy"
            @reassigned="refresh()"
          />
          <DeleteEntityButton
            v-if="removableInvoice"
            entity-type="invoice"
            :entity-id="id"
            :entity-label="invoice.invoiceNumberFormatted"
            :disabled="busy"
          />
        </template>
      </StaffPageHead>

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

      <div v-if="invoice && !isEditable" class="card" style="margin-bottom:16px;">
        <div class="cbody">
          This invoice is {{ invoice.status }} and cannot be edited.
          <NuxtLink :to="`/invoices/${id}`" class="btn sm" style="margin-left:8px;">View detail</NuxtLink>
        </div>
      </div>

      <p v-if="saveError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ saveError }}</p>

      <div v-if="canGeneratePdf || invoice.serviceLogId" class="ed-tabs-wrap">
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
            v-if="invoice.serviceLogId"
            type="button"
            class="ed-tab"
            :class="{ on: activeTab === 'servicelog' }"
            role="tab"
            :aria-selected="activeTab === 'servicelog'"
            @click="activeTab = 'servicelog'"
          >
            Service log
            <span v-if="serviceLogData?.log" class="ed-tab-pill">{{ logNumberDisplay(serviceLogData?.log?.logNumber ?? 0) }}</span>
            <span v-if="hasServiceLogPhotos" class="ed-tab-pill">{{ serviceLogImages.length }} photos</span>
          </button>
          <button
            v-if="canGeneratePdf"
            type="button"
            class="ed-tab"
            :class="{ on: activeTab === 'pdf' }"
            role="tab"
            :aria-selected="activeTab === 'pdf'"
            @click="activeTab = 'pdf'"
          >
            PDF preview
          </button>
        </div>
        <p v-if="invoice.serviceLogId" class="ed-tab-hint">Field photos and mechanic notes from the linked service log — reference while building line items.</p>
      </div>

      <div v-show="activeTab === 'invoice'" class="ed-pane" :class="{ active: activeTab === 'invoice' }">
        <div class="stack ed-invoice-stack">
          <div class="card">
            <div class="chead"><h3>Details</h3></div>
            <div class="cbody ed-details-grid">
              <label class="fld">
                Customer
                <select v-model="customerId" :disabled="!editable" @change="onCustomerChange">
                  <option v-if="!customerOptions.length" value="" disabled>
                    {{ customersPending ? 'Loading customers…' : 'No customers found' }}
                  </option>
                  <option v-for="c in customerOptions" :key="c.id" :value="c.id">
                    {{ c.displayName }}
                  </option>
                </select>
                <span class="help">{{ customerTermsHelp(selectedCustomer?.paymentTerms ?? invoice.paymentTerms, selectedCustomer?.accountKind) }}</span>
              </label>
              <label class="fld">
                Unit
                <select v-model="vehicleId" :disabled="!editable || !customerId" @change="patchHeader">
                  <option value="">— Select unit —</option>
                  <option v-if="vehiclesPending && !vehicleOptions.length" value="" disabled>Loading units…</option>
                  <option v-for="v in vehicleOptions" :key="v.id" :value="v.id">
                    {{ vehicleUnitLine(v) }}
                  </option>
                </select>
                <span class="help">{{ vehicleHelp }}</span>
              </label>
              <label class="fld">
                Invoice Date
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
                  :value="complaint"
                  rows="4"
                  placeholder="What the customer reported — printed on invoice PDF"
                  :disabled="!editable"
                  v-bind="complaintInputAttrs"
                  @input="onComplaintInput"
                  @blur="onComplaintFieldBlur"
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
                  :disabled="!editable || !canDescribe || auditBusy"
                  title="View line audit report (Ctrl+Shift+D)"
                  @click="openAuditReport"
                >
                  <span class="dot">✦</span> AI
                </button>
                <NuxtLink to="/catalog" class="btn sm">From catalog</NuxtLink>
                <AddPackageModal :disabled="!editable || busy" @applied="applyPackageLines" />
                <button
                  type="button"
                  class="btn sm primary"
                  :disabled="!editable || busy"
                  :title="!editable && lockedByOther ? 'Another user is editing this invoice' : !editable && sessionLoading ? 'Opening editor…' : !editable ? 'This invoice cannot be edited' : busy ? 'Saving…' : undefined"
                  @click="addEmptyLine"
                >
                  + Add line
                </button>
              </div>
            </div>
            <div class="tscroll">
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
                  <tr v-for="line in lines" :key="line.id">
                    <td>
                      <select v-model="line.lineType" :disabled="!editable" @change="patchLine(line)">
                        <option v-for="opt in LINE_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </td>
                    <td>
                      <CatalogLineAutocomplete
                        v-model="line.description"
                        v-model:line-type="line.lineType"
                        :line-id="line.id"
                        :disabled="!editable"
                        @focus="selectedLineId = line.id"
                        @blur="patchLine(line)"
                        @tab-next="focusLineQty(line.id)"
                        @select="applyCatalogToExistingLine(line, $event)"
                      />
                    </td>
                    <td>
                      <LineQuantityInput
                        v-model="line.quantity"
                        :line-id="line.id"
                        :disabled="!editable"
                        @blur="patchLine(line)"
                        @tab-next="focusLineRate(line.id)"
                      />
                    </td>
                    <td>
                      <LineCurrencyInput
                        v-model="line.unitPrice"
                        :line-id="line.id"
                        :disabled="!editable"
                        @blur="patchLine(line)"
                        @tab-next="onLineRateTabNext(line)"
                      />
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
                <span>{{ row.label }}<span v-if="row.note" class="sum-note">({{ row.note }})</span></span>
                <span :class="{ 'sum-strike': row.strikethrough }">{{ row.value }}</span>
              </div>
            </div>
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
                    <td class="chg">{{ formatHistoryChange(row.action, row.afterData ?? null, { changedFields: row.changedFields, beforeData: row.beforeData }) }}</td>
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

      <div v-if="editable" class="savebar ed-editor-savebar">
        <button
          type="button"
          class="btn primary"
          data-testid="invoice-editor-save"
          :disabled="busy || auditBusy"
          @click="saveInvoice"
        >
          {{ saveButtonLabel }}
        </button>
        <NuxtLink :to="`/invoices/${id}`" class="btn">Cancel</NuxtLink>
      </div>
      <div v-else-if="invoice" class="savebar ed-editor-savebar">
        <NuxtLink :to="`/invoices/${id}`" class="btn">Back to invoice</NuxtLink>
      </div>

      <div v-show="activeTab === 'servicelog' && serviceLogData?.log" class="ed-pane" :class="{ active: activeTab === 'servicelog' }">
        <div v-if="hasServiceLogPhotos && invoice.serviceLogId" class="card ed-log-photos-card">
          <div class="chead">
            <h3>Field photos · {{ serviceLogImages.length }}</h3>
            <div class="right">
              <NuxtLink
                :to="`/service-logs/${invoice.serviceLogId}`"
                class="btn ghost sm"
              >
                Open log →
              </NuxtLink>
            </div>
          </div>
          <div class="cbody">
            <ServiceLogPhotoManager
              :service-log-id="invoice.serviceLogId"
              :files="serviceLogImages"
            />
          </div>
        </div>

        <div class="cols">
          <div class="stack">
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
                <dt>Photos</dt><dd>{{ serviceLogImages.length || '—' }}</dd>
                <dt>Submitted by</dt><dd>{{ serviceLogData?.log?.submitterName ?? '—' }}</dd>
                <dt>Uploaded</dt><dd>{{ serviceLogData?.log?.createdAt ? invoiceDateDisplay(serviceLogData.log.createdAt.slice(0, 10)) : '—' }}</dd>
                <dt>Service date</dt><dd>{{ serviceLogData?.log?.serviceDate ? invoiceDateDisplay(serviceLogData.log.serviceDate) : '—' }}</dd>
                <dt>Unit</dt><dd>{{ serviceLogData?.log?.vehicle ? vehicleUnitLine(serviceLogData.log.vehicle) : '—' }}</dd>
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

      <div v-show="activeTab === 'pdf' && canGeneratePdf" class="ed-pane ed-pane--pdf" :class="{ active: activeTab === 'pdf' }">
        <InvoicePdfPreviewPane
          ref="pdfPreviewRef"
          :invoice-id="id"
          :invoice-label="invoice.invoiceNumberFormatted"
          :can-generate-pdf="canGeneratePdf"
        />
      </div>

      <InvoiceLineAuditModal
        :open="auditModalOpen"
        :suggestion="activeAuditSuggestion"
        :busy="auditBusy"
        :require-review="auditRequireReview"
        @close="closeAuditModal"
        @submit="submitAuditReview"
      />
    </template>

    <div v-else class="cp-state">Loading invoice…</div>
  </section>
</template>

<style scoped>
.ed-invoice-stack {
  max-width: 100%;
}

.ed-details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 18px;
}
.ed-po-span {
  grid-column: 1 / -1;
}
.ed-log-photos-card {
  margin-bottom: 16px;
}

.ed-log-photos-card .cbody {
  display: flex;
  flex-direction: column;
  min-height: 320px;
}
@media (max-width: 640px) {
  .ed-details-grid {
    grid-template-columns: 1fr;
  }
}
</style>
