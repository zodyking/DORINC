<script setup lang="ts">
// Customer portal requests — service, billing, general tabs (mockup: Portal Requests / P2-07).
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
const historyFilter = ref<PortalRequestHistoryFilter>('all')
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

const serviceForm = reactive({
  vehicleId: '',
  serviceCategory: PORTAL_SERVICE_CATEGORIES[0],
  urgency: 'normal',
  preferredDate: '',
  location: '',
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

function setHistoryFilter(filter: PortalRequestHistoryFilter) {
  historyFilter.value = filter
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
        location: serviceForm.location || null,
        description: serviceForm.description,
      },
    })
    submitMessage.value = 'Service request submitted — the shop will review.'
    serviceForm.description = ''
    serviceForm.preferredDate = ''
    serviceForm.location = ''
    await refreshRequests()
  }
  catch (err: unknown) {
    submitError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Unable to submit service request.'
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
    submitMessage.value = 'Billing request submitted — accounting will review.'
    billingForm.topic = ''
    billingForm.description = ''
    billingForm.invoiceId = ''
    await refreshRequests()
  }
  catch (err: unknown) {
    submitError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Unable to submit billing request.'
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
      submitMessage.value = 'Vehicle correction request submitted — the shop will review.'
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
    submitError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Unable to send message.'
  }
  finally {
    submitting.value = false
  }
}

const minDate = portalTodayIso()
</script>

<template>
  <section class="page active">
    <div v-if="pagePending && !vehicles.length && !history.length" class="card" style="padding:24px;">
      <p style="color:#64748b;font-size:13px;">Loading requests…</p>
    </div>

    <template v-else>
    <div class="pagehead">
      <div>
        <h2>Requests</h2>
        <p>Ask for service, get billing help, or send a message to the shop</p>
      </div>
    </div>

    <p
      v-if="submitMessage"
      class="callout info"
      style="margin-bottom:16px;"
    >
      <span class="ico">✓</span>
      <span>{{ submitMessage }}</span>
    </p>

    <div class="cols">
      <div class="card">
        <div class="chead">
          <h3>Submit a request</h3>
          <span style="font-size:12px;color:#94a3b8;">Step 1 · Choose type</span>
        </div>

        <div class="type-grid" role="tablist" aria-label="Request type">
          <button
            type="button"
            class="type-card"
            :class="{ on: activeTab === 'service' }"
            role="tab"
            :aria-selected="activeTab === 'service'"
            @click="setTab('service')"
          >
            <span class="t-ico">🔧</span>
            <b>Service</b>
            <small>Schedule repair, PM, or diagnostics for a fleet unit</small>
          </button>
          <button
            type="button"
            class="type-card"
            :class="{ on: activeTab === 'billing' }"
            role="tab"
            :aria-selected="activeTab === 'billing'"
            @click="setTab('billing')"
          >
            <span class="t-ico">💳</span>
            <b>Billing</b>
            <small>Questions about invoices, payments, or charges</small>
          </button>
          <button
            type="button"
            class="type-card"
            :class="{ on: activeTab === 'general' }"
            role="tab"
            :aria-selected="activeTab === 'general'"
            @click="setTab('general')"
          >
            <span class="t-ico">💬</span>
            <b>General</b>
            <small>Account updates, hours, or anything else</small>
          </button>
        </div>

        <form
          v-show="activeTab === 'service'"
          class="req-form"
          :class="{ active: activeTab === 'service' }"
          @submit.prevent="submitService"
        >
          <div class="sect">
            <p class="sect-title">Vehicle &amp; urgency</p>
            <label class="fld">
              <span>Vehicle <span style="color:#dc2626">*</span></span>
              <select v-model="serviceForm.vehicleId" required :disabled="!vehicles.length">
                <option v-if="!vehicles.length" value="">No vehicles on file</option>
                <option v-for="veh in vehicles" :key="veh.id" :value="veh.id">{{ veh.tagLabel }}</option>
              </select>
              <span class="help">
                Need a new unit?
                <NuxtLink to="/portal/vehicles">Add a vehicle</NuxtLink>
                first, then return here.
              </span>
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
                  <option
                    v-for="opt in PORTAL_SERVICE_URGENCIES"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </label>
            </div>
          </div>
          <div class="sect">
            <p class="sect-title">When &amp; where</p>
            <div class="row2">
              <label class="fld">
                <span>Preferred date</span>
                <input v-model="serviceForm.preferredDate" type="date" :min="minDate">
              </label>
              <label class="fld">
                <span>Location / yard</span>
                <input v-model="serviceForm.location" type="text" placeholder="e.g. Main terminal, Bay 3">
              </label>
            </div>
          </div>
          <div class="sect">
            <p class="sect-title">Details</p>
            <label class="fld">
              <span>Describe the issue or work needed <span style="color:#dc2626">*</span></span>
              <textarea
                v-model="serviceForm.description"
                rows="4"
                required
                placeholder="Symptoms, fault codes, mileage, anything that helps the shop prepare…"
              />
            </label>
          </div>
          <p v-if="submitError && activeTab === 'service'" class="help" style="color:#dc2626;">{{ submitError }}</p>
          <button type="submit" class="btn primary" :disabled="submitting || !vehicles.length">
            {{ submitting ? 'Submitting…' : 'Submit service request' }}
          </button>
        </form>

        <form
          v-show="activeTab === 'billing'"
          class="req-form"
          :class="{ active: activeTab === 'billing' }"
          @submit.prevent="submitBilling"
        >
          <div class="sect">
            <p class="sect-title">Invoice reference</p>
            <label class="fld">
              <span>Related invoice</span>
              <select v-model="billingForm.invoiceId">
                <option value="">Not tied to a specific invoice</option>
                <option
                  v-for="inv in invoices"
                  :key="inv.id"
                  :value="inv.id"
                >
                  {{ portalInvoiceOptionLabel(inv.invoiceNumberFormatted, inv.vehicleLabel, inv.balanceDue, inv.status) }}
                </option>
              </select>
            </label>
            <label class="fld">
              <span>Topic <span style="color:#dc2626">*</span></span>
              <select v-model="billingForm.topic" required>
                <option value="">Select a topic…</option>
                <option v-for="topic in PORTAL_BILLING_TOPICS" :key="topic" :value="topic">{{ topic }}</option>
              </select>
            </label>
          </div>
          <div class="sect">
            <p class="sect-title">Your message</p>
            <label class="fld">
              <span>Details <span style="color:#dc2626">*</span></span>
              <textarea
                v-model="billingForm.description"
                rows="5"
                required
                placeholder="Include invoice line numbers, payment dates, or what you need clarified…"
              />
            </label>
          </div>
          <p v-if="submitError && activeTab === 'billing'" class="help" style="color:#dc2626;">{{ submitError }}</p>
          <button type="submit" class="btn primary" :disabled="submitting || !billingForm.topic">
            {{ submitting ? 'Submitting…' : 'Submit billing request' }}
          </button>
        </form>

        <form
          v-show="activeTab === 'general'"
          class="req-form"
          :class="{ active: activeTab === 'general' }"
          @submit.prevent="submitGeneral"
        >
          <div class="sect">
            <p class="sect-title">Message</p>
            <label class="fld">
              <span>Request type</span>
              <select v-model="generalForm.requestKind">
                <option value="message">General message</option>
                <option value="vehicle_correction">Vehicle data correction</option>
              </select>
            </label>
            <label v-if="generalForm.requestKind === 'vehicle_correction'" class="fld">
              <span>Vehicle <span style="color:#dc2626">*</span></span>
              <select v-model="generalForm.vehicleId" required :disabled="!vehicles.length">
                <option v-if="!vehicles.length" value="">No vehicles on file</option>
                <option v-for="veh in vehicles" :key="veh.id" :value="veh.id">{{ veh.tagLabel }}</option>
              </select>
            </label>
            <label class="fld">
              <span>Subject <span style="color:#dc2626">*</span></span>
              <input
                v-model="generalForm.subject"
                type="text"
                required
                maxlength="120"
                placeholder="Brief summary"
              >
            </label>
            <label class="fld">
              <span>Message <span style="color:#dc2626">*</span></span>
              <textarea
                v-model="generalForm.message"
                rows="5"
                required
                placeholder="How can we help?"
              />
            </label>
            <div class="callout" style="margin:0;">
              <span class="ico">💡</span>
              <div>
                To <b>add a vehicle</b>, use <b>Vehicles → Add vehicle</b>.
                Vehicle removal must be requested by phone or email — units cannot be deleted from the portal.
              </div>
            </div>
          </div>
          <p v-if="submitError && activeTab === 'general'" class="help" style="color:#dc2626;">{{ submitError }}</p>
          <button
            type="submit"
            class="btn primary"
            :disabled="submitting || (generalForm.requestKind === 'vehicle_correction' && !vehicles.length)"
          >
            {{ submitting ? 'Sending…' : generalForm.requestKind === 'vehicle_correction' ? 'Submit correction request' : 'Send message' }}
          </button>
        </form>
      </div>

      <div class="card">
        <div class="chead">
          <h3>Request history</h3>
          <div class="hist-filters">
            <button
              type="button"
              class="chip"
              :class="{ on: historyFilter === 'all' }"
              @click="setHistoryFilter('all')"
            >
              All
            </button>
            <button
              type="button"
              class="chip"
              :class="{ on: historyFilter === 'open' }"
              @click="setHistoryFilter('open')"
            >
              Open
            </button>
            <button
              type="button"
              class="chip"
              :class="{ on: historyFilter === 'resolved' }"
              @click="setHistoryFilter('resolved')"
            >
              Resolved
            </button>
          </div>
        </div>

        <div v-if="filteredHistory.length">
          <div
            v-for="req in filteredHistory"
            :key="`${req.kind}-${req.id}`"
            class="req-card"
            :data-req-status="req.isOpen ? 'open' : 'resolved'"
            :data-req-kind="req.kind"
          >
            <span class="req-type-pill">{{ portalRequestKindLabel(req.kind) }}</span>
            <b>{{ req.title }}</b>
            <div class="meta">
              {{ req.meta }} ·
              <span :class="portalRequestStatusPill(req.status).cls">
                {{ portalRequestStatusPill(req.status).label }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="req-empty">No requests match this filter.</div>
      </div>
    </div>
    </template>
  </section>
</template>
