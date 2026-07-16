<script setup lang="ts">
import {
  PORTAL_BILLING_TOPICS,
  PORTAL_SERVICE_CATEGORIES,
  PORTAL_SERVICE_URGENCIES,
  portalInvoiceOptionLabel,
  portalRequestKindLabel,
  portalRequestMatchesFilter,
  portalRequestStatusPill,
  portalTodayIso,
  type PortalRequestHistoryFilter,
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

interface PortalRequestItem {
  id: string
  kind: string
  title: string
  meta: string
  status: string
  statusLabel: string
  createdAt: string
  isOpen: boolean
}

const activeTab = ref<PortalRequestTab>('service')
const historyFilter = ref<PortalRequestHistoryFilter>('open')
const submitMessage = ref('')
const submitError = ref('')
const submitting = ref(false)

const { data: vehiclesData, pending: vehiclesPending } = useClientFetch<{ items: PortalVehicleOption[] }>('/api/portal/vehicles')
const { data: invoicesData, pending: invoicesPending } = useClientFetch<{ items: PortalInvoiceOption[] }>('/api/portal/invoices')
const { data: requestsData, refresh: refreshRequests, pending: requestsPending } = useClientFetch<{ items: PortalRequestItem[] }>('/api/portal/requests')

const pagePending = computed(() => vehiclesPending.value || invoicesPending.value || requestsPending.value)

const vehicles = computed(() => vehiclesData.value?.items ?? [])
const invoices = computed(() => invoicesData.value?.items ?? [])
const history = computed(() => requestsData.value?.items ?? [])

const filteredHistory = computed(() =>
  history.value.filter(item => portalRequestMatchesFilter(item, historyFilter.value)),
)

const tabs: Array<{ id: PortalRequestTab, label: string }> = [
  { id: 'service', label: 'Service' },
  { id: 'billing', label: 'Billing' },
  { id: 'general', label: 'Message' },
]

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
    submitMessage.value = 'Service request sent — the shop will follow up.'
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
  submitting.value = true
  try {
    await $fetch('/api/portal/invoice-change-requests', {
      method: 'POST',
      body: {
        invoiceId: billingForm.invoiceId || null,
        topic: billingForm.topic,
        description: billingForm.description,
      },
    })
    submitMessage.value = 'Billing question sent — accounting will review.'
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
    <div v-if="pagePending && !vehicles.length && !history.length" class="card portal-card">
      <p class="portal-muted">Loading…</p>
    </div>

    <template v-else>
      <div class="pagehead portal-pagehead">
        <div>
          <h2>Contact shop</h2>
          <p>Request service, ask about an invoice, or send a message</p>
        </div>
      </div>

      <p v-if="submitMessage" class="portal-banner success">{{ submitMessage }}</p>

      <div class="card portal-card">
        <div class="portal-tab-row" role="tablist" aria-label="Request type">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="chip"
            role="tab"
            :class="{ on: activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            @click="setTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>

        <form v-show="activeTab === 'service'" class="portal-form" @submit.prevent="submitService">
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
          <p v-if="submitError && activeTab === 'service'" class="portal-error">{{ submitError }}</p>
          <button type="submit" class="btn primary" :disabled="submitting || !vehicles.length">
            {{ submitting ? 'Sending…' : 'Send service request' }}
          </button>
        </form>

        <form v-show="activeTab === 'billing'" class="portal-form" @submit.prevent="submitBilling">
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
            <textarea v-model="billingForm.description" rows="4" required placeholder="What do you need clarified?" />
          </label>
          <p v-if="submitError && activeTab === 'billing'" class="portal-error">{{ submitError }}</p>
          <button type="submit" class="btn primary" :disabled="submitting || !billingForm.topic">
            {{ submitting ? 'Sending…' : 'Send billing question' }}
          </button>
        </form>

        <form v-show="activeTab === 'general'" class="portal-form" @submit.prevent="submitGeneral">
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
          <p v-if="submitError && activeTab === 'general'" class="portal-error">{{ submitError }}</p>
          <button
            type="submit"
            class="btn primary"
            :disabled="submitting || (generalForm.requestKind === 'vehicle_correction' && !vehicles.length)"
          >
            {{ submitting ? 'Sending…' : 'Send message' }}
          </button>
        </form>
      </div>

      <div class="card portal-card">
        <div class="chead">
          <h3>Your requests</h3>
          <div class="portal-tab-row compact">
            <button type="button" class="chip" :class="{ on: historyFilter === 'open' }" @click="historyFilter = 'open'">Open</button>
            <button type="button" class="chip" :class="{ on: historyFilter === 'all' }" @click="historyFilter = 'all'">All</button>
            <button type="button" class="chip" :class="{ on: historyFilter === 'resolved' }" @click="historyFilter = 'resolved'">Done</button>
          </div>
        </div>
        <div v-if="filteredHistory.length" class="portal-list">
          <div v-for="req in filteredHistory" :key="`${req.kind}-${req.id}`" class="portal-list-row static">
            <div class="portal-list-main">
              <b>{{ req.title }}</b>
              <span>{{ portalRequestKindLabel(req.kind) }} · {{ req.meta }}</span>
            </div>
            <span :class="portalRequestStatusPill(req.status).cls">
              {{ portalRequestStatusPill(req.status).label }}
            </span>
          </div>
        </div>
        <div v-else class="portal-empty">No requests in this view.</div>
      </div>
    </template>
  </section>
</template>
