<script setup lang="ts">
import {
  PORTAL_BILLING_TOPICS,
  PORTAL_SERVICE_CATEGORIES,
  PORTAL_SERVICE_URGENCIES,
  portalInvoiceOptionLabel,
  portalRequestApplyListFilters,
  portalRequestDefaultListFilters,
  portalRequestDetailPath,
  portalRequestHistoryFilterLabel,
  portalRequestInvoiceOptions,
  portalRequestKindFilterLabel,
  portalRequestKindLabel,
  portalRequestListFiltersDirty,
  portalRequestStatusPill,
  portalRequestVehicleOptions,
  portalTodayIso,
  type PortalRequestHistoryFilter,
  type PortalRequestKindFilter,
  type PortalRequestListRow,
  type PortalRequestSort,
  type PortalRequestTab,
} from '~/utils/portal-requests-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth', name: 'portal-customer-requests' })

interface PortalVehicleOption {
  id: string
  tagLabel: string
}

interface PortalInvoiceOption {
  id: string
  invoiceNumberFormatted: string
  vehicleLabel: string
  balanceDue: string
  status: string
}

const activeTab = ref<PortalRequestTab>('service')
const listFilters = reactive(portalRequestDefaultListFilters())
const submitMessage = ref('')
const submitError = ref('')
const submitting = ref(false)

const { data: vehiclesData, pending: vehiclesPending } = useClientFetch<{ items: PortalVehicleOption[] }>('/api/portal/vehicles')
const { data: invoicesData, pending: invoicesPending } = useClientFetch<{ items: PortalInvoiceOption[] }>('/api/portal/invoices')
const { data: requestsData, refresh: refreshRequests, pending: requestsPending } = useClientFetch<{ items: PortalRequestListRow[] }>('/api/portal/requests')

const pagePending = computed(() => vehiclesPending.value || invoicesPending.value || requestsPending.value)

const vehicles = computed(() => vehiclesData.value?.items ?? [])
const invoices = computed(() => invoicesData.value?.items ?? [])
const history = computed(() => requestsData.value?.items ?? [])

const filteredHistory = computed(() => portalRequestApplyListFilters(history.value, listFilters))

const vehicleFilterOptions = computed(() => portalRequestVehicleOptions(history.value))
const invoiceFilterOptions = computed(() => portalRequestInvoiceOptions(history.value))

const tabs: Array<{ id: PortalRequestTab, label: string }> = [
  { id: 'service', label: 'Service' },
  { id: 'billing', label: 'Billing' },
  { id: 'general', label: 'Message' },
]

const statusFilterOptions: PortalRequestHistoryFilter[] = ['open', 'all', 'resolved']
const kindFilterOptions: PortalRequestKindFilter[] = ['all', 'service', 'billing', 'general', 'vehicle']
const sortOptions: PortalRequestSort[] = ['newest', 'oldest', 'type', 'vehicle']

const filtersDirty = computed(() => portalRequestListFiltersDirty(listFilters))

function clearHistoryFilters() {
  Object.assign(listFilters, portalRequestDefaultListFilters())
}

const historyCountLabel = computed(() => {
  const n = filteredHistory.value.length
  if (!n) return 'No requests'
  return `${n} request${n === 1 ? '' : 's'}`
})

const serviceForm = reactive({
  vehicleId: '',
  serviceCategory: PORTAL_SERVICE_CATEGORIES[0],
  urgency: 'normal',
  preferredDate: '',
  description: '',
})

const billingForm = reactive({
  invoiceId: '',
  topic: '',
  description: '',
})

const generalForm = reactive({
  requestKind: 'message' as 'message' | 'vehicle_correction',
  vehicleId: '',
  subject: '',
  message: '',
})

function setTab(tab: PortalRequestTab) {
  activeTab.value = tab
  submitMessage.value = ''
  submitError.value = ''
}

watch(vehicles, (list) => {
  if (!serviceForm.vehicleId && list[0]) serviceForm.vehicleId = list[0].id
  if (!generalForm.vehicleId && list[0]) generalForm.vehicleId = list[0].id
}, { immediate: true })

async function submitService() {
  submitError.value = ''
  submitting.value = true
  try {
    await $fetch('/api/portal/service-requests', {
      method: 'POST',
      body: {
        vehicleId: serviceForm.vehicleId,
        serviceCategory: serviceForm.serviceCategory,
        urgency: serviceForm.urgency,
        preferredDate: serviceForm.preferredDate || null,
        location: null,
        description: serviceForm.description,
      },
    })
    submitMessage.value = 'Service request submitted — our shop will prepare a service log.'
    serviceForm.description = ''
    serviceForm.preferredDate = ''
    await refreshRequests()
  }
  catch (err: unknown) {
    submitError.value = (err as { data?: { message?: string, data?: { message?: string } } })?.data?.data?.message
      ?? (err as { data?: { message?: string } })?.data?.message
      ?? 'Unable to submit service request.'
  }
  finally {
    submitting.value = false
  }
}

async function submitBilling() {
  submitError.value = ''
  if (!billingForm.topic.trim()) {
    submitError.value = 'Select a topic for your billing question.'
    return
  }
  if (!billingForm.description.trim()) {
    submitError.value = 'Describe what you need help with.'
    return
  }
  submitting.value = true
  try {
    await $fetch('/api/portal/invoice-change-requests', {
      method: 'POST',
      body: {
        invoiceId: billingForm.invoiceId || null,
        topic: billingForm.topic,
        description: billingForm.description.trim(),
      },
    })
    submitMessage.value = billingForm.invoiceId
      ? 'Billing question sent — accounting will review.'
      : 'Billing question sent — accounting will review.'
    billingForm.topic = ''
    billingForm.description = ''
    billingForm.invoiceId = ''
    await refreshRequests()
  }
  catch (err: unknown) {
    submitError.value = (err as { data?: { message?: string, data?: { message?: string } } })?.data?.data?.message
      ?? (err as { data?: { message?: string } })?.data?.message
      ?? 'Unable to submit billing request.'
  }
  finally {
    submitting.value = false
  }
}

async function submitGeneral() {
  submitError.value = ''
  submitting.value = true
  try {
    if (generalForm.requestKind === 'vehicle_correction') {
      await $fetch('/api/portal/vehicle-change-requests', {
        method: 'POST',
        body: {
          vehicleId: generalForm.vehicleId,
          subject: generalForm.subject,
          description: generalForm.message,
        },
      })
      submitMessage.value = 'Correction request sent.'
    }
    else {
      await $fetch('/api/portal/general-requests', {
        method: 'POST',
        body: {
          subject: generalForm.subject,
          message: generalForm.message,
        },
      })
      submitMessage.value = 'Message sent to the shop.'
    }
    generalForm.subject = ''
    generalForm.message = ''
    await refreshRequests()
  }
  catch (err: unknown) {
    submitError.value = (err as { data?: { message?: string, data?: { message?: string } } })?.data?.data?.message
      ?? (err as { data?: { message?: string } })?.data?.message
      ?? 'Unable to send message.'
  }
  finally {
    submitting.value = false
  }
}

const minDate = portalTodayIso()
</script>

<template>
  <section class="page active portal-page">
    <div v-if="pagePending && !vehicles.length && !history.length" class="card">
      <div class="empty">Loading…</div>
    </div>

    <template v-else>
      <PortalPageHead subtitle="Request service, ask about an invoice, or send a message">
        <template #title>Contact shop</template>
      </PortalPageHead>

      <p v-if="submitMessage" class="callout info">{{ submitMessage }}</p>

      <div class="card">
        <div class="chead"><h3>New request</h3></div>
        <div class="cbody">
          <div class="ed-tabs-wrap">
            <div class="ed-tabs" role="tablist" aria-label="Request type">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                type="button"
                class="ed-tab"
                role="tab"
                :class="{ on: activeTab === tab.id }"
                :aria-selected="activeTab === tab.id"
                @click="setTab(tab.id)"
              >
                {{ tab.label }}
              </button>
            </div>
          </div>

          <form v-show="activeTab === 'service'" @submit.prevent="submitService">
            <label class="fld">
              <span>Vehicle</span>
              <select v-model="serviceForm.vehicleId" required :disabled="!vehicles.length">
                <option v-if="!vehicles.length" value="">No vehicles on file</option>
                <option v-for="veh in vehicles" :key="veh.id" :value="veh.id">{{ veh.tagLabel }}</option>
              </select>
            </label>
            <div class="row2">
              <label class="fld">
                <span>Service type</span>
                <select v-model="serviceForm.serviceCategory">
                  <option v-for="cat in PORTAL_SERVICE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </label>
              <label class="fld">
                <span>Urgency</span>
                <select v-model="serviceForm.urgency">
                  <option v-for="opt in PORTAL_SERVICE_URGENCIES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </label>
            </div>
            <label class="fld">
              <span>Preferred date (optional)</span>
              <input v-model="serviceForm.preferredDate" type="date" :min="minDate">
            </label>
            <label class="fld">
              <span>What do you need?</span>
              <textarea v-model="serviceForm.description" rows="4" required placeholder="Describe the work or issue…" />
            </label>
            <p v-if="submitError && activeTab === 'service'" class="help" style="color:#dc2626;">{{ submitError }}</p>
            <button type="submit" class="btn primary" :disabled="submitting || !vehicles.length">
              {{ submitting ? 'Sending…' : 'Send service request' }}
            </button>
          </form>

          <form v-show="activeTab === 'billing'" @submit.prevent="submitBilling">
            <label class="fld">
              <span>Invoice (optional)</span>
              <select v-model="billingForm.invoiceId">
                <option value="">General billing question</option>
                <option v-for="inv in invoices" :key="inv.id" :value="inv.id">
                  {{ portalInvoiceOptionLabel(inv.invoiceNumberFormatted, inv.vehicleLabel, inv.balanceDue, inv.status) }}
                </option>
              </select>
            </label>
            <label class="fld">
              <span>Topic</span>
              <select v-model="billingForm.topic" required>
                <option value="">Select a topic…</option>
                <option v-for="topic in PORTAL_BILLING_TOPICS" :key="topic" :value="topic">{{ topic }}</option>
              </select>
            </label>
            <label class="fld">
              <span>Details</span>
              <textarea
                v-model="billingForm.description"
                rows="4"
                required
                :placeholder="billingForm.invoiceId ? 'Explain the issue with this invoice…' : 'What do you need clarified?'"
              />
            </label>
            <p v-if="submitError && activeTab === 'billing'" class="help" style="color:#dc2626;">{{ submitError }}</p>
            <button type="submit" class="btn primary" :disabled="submitting">
              {{ submitting ? 'Sending…' : 'Send billing question' }}
            </button>
          </form>

          <form v-show="activeTab === 'general'" @submit.prevent="submitGeneral">
            <label class="fld">
              <span>Type</span>
              <select v-model="generalForm.requestKind">
                <option value="message">General message</option>
                <option value="vehicle_correction">Vehicle data correction</option>
              </select>
            </label>
            <label v-if="generalForm.requestKind === 'vehicle_correction'" class="fld">
              <span>Vehicle</span>
              <select v-model="generalForm.vehicleId" required :disabled="!vehicles.length">
                <option v-if="!vehicles.length" value="">No vehicles on file</option>
                <option v-for="veh in vehicles" :key="veh.id" :value="veh.id">{{ veh.tagLabel }}</option>
              </select>
            </label>
            <label class="fld">
              <span>Subject</span>
              <input v-model="generalForm.subject" type="text" required maxlength="120" placeholder="Brief summary">
            </label>
            <label class="fld">
              <span>Message</span>
              <textarea v-model="generalForm.message" rows="4" required placeholder="How can we help?" />
            </label>
            <p v-if="submitError && activeTab === 'general'" class="help" style="color:#dc2626;">{{ submitError }}</p>
            <button
              type="submit"
              class="btn primary"
              :disabled="submitting || (generalForm.requestKind === 'vehicle_correction' && !vehicles.length)"
            >
              {{ submitting ? 'Sending…' : 'Send message' }}
            </button>
          </form>
        </div>
      </div>

      <ListFilterBar
        v-model:search="listFilters.q"
        search-placeholder="Search requests, vehicles, invoices…"
        search-aria-label="Search requests"
        :count-label="historyCountLabel"
        :filters-active="filtersDirty"
        filter-title="Filter requests"
        @clear-filters="clearHistoryFilters"
      >
        <template #filters>
          <label class="fld">
            Status
            <select v-model="listFilters.status" aria-label="Request status">
              <option v-for="opt in statusFilterOptions" :key="opt" :value="opt">
                {{ portalRequestHistoryFilterLabel(opt) }}
              </option>
            </select>
          </label>
          <label class="fld">
            Type
            <select v-model="listFilters.kind" aria-label="Request type">
              <option v-for="opt in kindFilterOptions" :key="opt" :value="opt">
                {{ portalRequestKindFilterLabel(opt) }}
              </option>
            </select>
          </label>
          <label class="fld">
            Vehicle
            <select v-model="listFilters.vehicleId" aria-label="Filter by vehicle">
              <option value="all">All vehicles</option>
              <option v-for="veh in vehicleFilterOptions" :key="veh.id" :value="veh.id">
                {{ veh.label }}
              </option>
            </select>
          </label>
          <label class="fld">
            Invoice
            <select v-model="listFilters.invoiceId" aria-label="Filter by invoice">
              <option value="all">All invoices</option>
              <option v-for="inv in invoiceFilterOptions" :key="inv.id" :value="inv.id">
                {{ inv.label }}
              </option>
            </select>
          </label>
          <label class="fld">
            Submitted from
            <input v-model="listFilters.dateFrom" type="date" aria-label="Submitted from date">
          </label>
          <label class="fld">
            Submitted to
            <input v-model="listFilters.dateTo" type="date" aria-label="Submitted to date">
          </label>
          <label class="fld">
            Sort by
            <select v-model="listFilters.sort" aria-label="Sort requests">
              <option v-for="opt in sortOptions" :key="opt" :value="opt">
                {{ opt === 'newest' ? 'Newest first' : opt === 'oldest' ? 'Oldest first' : opt === 'type' ? 'Type' : 'Vehicle' }}
              </option>
            </select>
          </label>
        </template>
      </ListFilterBar>

      <div class="card">
        <div v-if="filteredHistory.length" class="tscroll">
          <table class="tbl portal-request-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="req in filteredHistory"
                :key="`${req.kind}-${req.id}`"
                class="portal-request-row"
                tabindex="0"
                role="link"
                :aria-label="`View ${req.title}`"
                @click="navigateTo(portalRequestDetailPath(req.kind, req.id))"
                @keydown.enter="navigateTo(portalRequestDetailPath(req.kind, req.id))"
              >
                <td>
                  <span class="lead">{{ req.title }}</span>
                  <span class="sub">{{ req.meta }}</span>
                </td>
                <td>{{ portalRequestKindLabel(req.kind) }}</td>
                <td>
                  <span :class="portalRequestStatusPill(req.status).cls">
                    {{ portalRequestStatusPill(req.status).label }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty">No requests in this view.</div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.portal-request-row {
  cursor: pointer;
}
.portal-request-row:hover {
  background: #f8fafc;
}
.portal-request-row:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: -2px;
}
</style>
