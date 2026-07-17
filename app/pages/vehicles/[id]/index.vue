<script setup lang="ts">
// Vehicle detail (mockup: PAGE: VEHICLE DETAIL).
import { formatAuditChangeMessage } from '#shared/audit-messages'
import {
  invoiceDateDisplay,
  invoiceStatusPill,
  moneyDisplay,
  type InvoiceStatus,
} from '~/utils/invoices-ui'
definePageMeta({ layout: 'staff' })

interface Vehicle {
  id: string
  customerId: string
  unitType: string
  busNumber: string | null
  unitTag: string | null
  vin: string | null
  plate: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  bodyClass: string | null
  engine: string | null
  fuelType: string | null
  color: string | null
  odometer: string | null
  odometerUnit: string
  status: string
  notes: string | null
  vinDecodeRaw: Record<string, unknown> | null
  archivedAt: string | null
  createdAt: string
}

interface HistoryRow {
  id: string
  action: string
  actorName: string | null
  changedFields: string[] | null
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  createdAt: string
}

interface RecentInvoiceRow {
  id: string
  invoiceNumberFormatted: string
  status: string
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
}

const route = useRoute()
const auth = useAuthStore()
const vehicleId = computed(() => String(route.params.id || ''))

const { data, refresh, error } = useClientFetch<{
  vehicle: Vehicle
  customer: { id: string, displayName: string } | null
  history: HistoryRow[]
  recentInvoices: RecentInvoiceRow[]
  invoiceCount: number
}>(() => `/api/vehicles/${vehicleId.value}`, { watch: [vehicleId] })

const vehicle = computed(() => data.value?.vehicle)
const customer = computed(() => data.value?.customer)
const history = computed(() => data.value?.history ?? [])
const recentInvoices = computed(() => data.value?.recentInvoices ?? [])
const invoiceCount = computed(() => data.value?.invoiceCount ?? recentInvoices.value.length)
const canCreateInvoice = computed(() => auth.can('invoices.create.all'))
const canReadInvoices = computed(() => auth.can('invoices.read.all'))

const newInvoiceLink = computed(() => {
  if (!vehicle.value) return '/invoices/new'
  const q = new URLSearchParams()
  q.set('vehicleId', vehicle.value.id)
  q.set('customerId', vehicle.value.customerId)
  return `/invoices/new?${q.toString()}`
})

const canUpdate = computed(() => auth.can('vehicles.update.all'))
const canArchive = computed(() => auth.can('vehicles.archive.all'))

const busy = ref(false)
const flash = ref('')
const flashKind = ref<'ok' | 'err'>('ok')

async function toggleArchive() {
  if (!vehicle.value) return
  busy.value = true
  flash.value = ''
  try {
    const action = vehicle.value.archivedAt ? 'restore' : 'archive'
    await $fetch(`/api/vehicles/${route.params.id}/${action}`, { method: 'POST' })
    await refresh()
    flash.value = action === 'archive' ? 'Vehicle archived' : 'Vehicle restored'
    flashKind.value = 'ok'
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    flash.value = fe.data?.data?.message ?? 'Something went wrong — try again'
    flashKind.value = 'err'
  }
  finally {
    busy.value = false
  }
}

function histChange(h: HistoryRow): string {
  return formatAuditChangeMessage({
    action: h.action,
    changedFields: h.changedFields,
    beforeData: h.beforeData,
    afterData: h.afterData,
  })
}

function histWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:32px; text-align:center; color:#64748b;">
      Vehicle not found. <NuxtLink to="/vehicles">Back to vehicles</NuxtLink>
    </div>

    <template v-else-if="vehicle">
      <StaffPageHead>
        <template #title>
          {{ vehicleTag(vehicle) }}
          <span :class="vehicleStatusPill(vehicle).cls" style="vertical-align:3px">{{ vehicleStatusPill(vehicle).label }}</span>
        </template>
        <template #subtitle>
          <NuxtLink to="/vehicles">Vehicles</NuxtLink> /
          {{ vehicleSub(vehicle) }}<template v-if="customer"> · {{ customer.displayName }}</template>
        </template>
        <template #actions>
          <NuxtLink v-if="canUpdate" :to="`/vehicles/${vehicle.id}/edit`" class="btn">Edit unit</NuxtLink>
          <button
            v-if="vehicle.archivedAt && canArchive"
            class="btn"
            :disabled="busy"
            @click="toggleArchive"
          >
            Restore
          </button>
          <NuxtLink
            v-if="canCreateInvoice"
            :to="newInvoiceLink"
            class="btn primary"
          >
            + New Invoice
          </NuxtLink>
        </template>
      </StaffPageHead>

      <p v-if="flash" class="flash" :class="flashKind">{{ flash }}</p>

      <div class="cols">
        <div class="stack">
          <div class="card">
            <div class="chead"><h3>Unit details</h3></div>
            <dl class="kv">
              <dt>Tag</dt><dd>{{ vehicleTag(vehicle) }}</dd>
              <dt>Year / Make / Model</dt><dd>{{ vehicleSub(vehicle) }}</dd>
              <dt>VIN</dt><dd class="mono" style="font-size:12px">{{ vehicle.vin ?? '—' }}</dd>
              <dt>Plate</dt><dd>{{ vehicle.plate ?? '—' }}</dd>
              <dt>Customer</dt>
              <dd>
                <NuxtLink v-if="customer" :to="`/customers/${customer.id}`">{{ customer.displayName }}</NuxtLink>
                <template v-else>—</template>
              </dd>
              <dt>Odometer</dt><dd>{{ odoDisplay(vehicle.odometer, vehicle.odometerUnit) }}</dd>
              <dt v-if="vehicle.bodyClass">Body class</dt><dd v-if="vehicle.bodyClass">{{ vehicle.bodyClass }}</dd>
              <dt v-if="vehicle.engine">Engine</dt><dd v-if="vehicle.engine">{{ vehicle.engine }}</dd>
              <dt v-if="vehicle.fuelType">Fuel</dt><dd v-if="vehicle.fuelType">{{ vehicle.fuelType }}</dd>
              <dt v-if="vehicle.color">Color</dt><dd v-if="vehicle.color">{{ vehicle.color }}</dd>
              <dt>Added</dt><dd>{{ new Date(vehicle.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }}</dd>
            </dl>
          </div>
          <div class="card">
            <div class="chead">
              <h3>Invoices · {{ invoiceCount }}</h3>
              <div v-if="canReadInvoices && customer" class="right">
                <NuxtLink
                  :to="`/invoices?q=${encodeURIComponent(customer.displayName)}`"
                  class="btn sm"
                >
                  View all
                </NuxtLink>
              </div>
            </div>
            <div v-if="recentInvoices.length" class="tscroll">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Issued</th>
                    <th>Status</th>
                    <th class="num">Amount</th>
                    <th class="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="inv in recentInvoices"
                    :key="inv.id"
                    :class="{ click: canReadInvoices }"
                    @click="canReadInvoices ? navigateTo(`/invoices/${inv.id}`) : undefined"
                  >
                    <td><span class="lead">{{ inv.invoiceNumberFormatted }}</span></td>
                    <td>{{ invoiceDateDisplay(inv.invoiceDate) }}</td>
                    <td>
                      <span :class="invoiceStatusPill(inv.status as InvoiceStatus, inv.dueDate, inv.balanceDue).cls">
                        {{ invoiceStatusPill(inv.status as InvoiceStatus, inv.dueDate, inv.balanceDue).label }}
                      </span>
                    </td>
                    <td class="num">{{ moneyDisplay(inv.total) }}</td>
                    <td class="num">{{ moneyDisplay(inv.balanceDue) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty" style="display:block;">No invoices yet.</div>
          </div>
          <div v-if="vehicle.notes" class="card">
            <div class="chead"><h3>Notes</h3></div>
            <div class="cbody" style="font-size:13px; color:#475569; line-height:1.6;">
              {{ vehicle.notes }}
            </div>
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="chead"><h3>Change history</h3></div>
            <div v-if="history.length" class="tscroll">
              <table class="tbl hist-log">
                <thead><tr><th>When</th><th>User</th><th>Change</th></tr></thead>
                <tbody>
                  <tr v-for="h in history" :key="h.id">
                    <td class="when">{{ histWhen(h.createdAt) }}</td>
                    <td class="who">{{ h.actorName ?? 'System' }}</td>
                    <td class="chg">{{ histChange(h) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty" style="display:block;">No changes recorded yet.</div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.flash {
  margin: -8px 0 14px;
  font-size: 13px;
  font-weight: 500;
}
.flash.err {
  color: #dc2626;
}
.flash.ok {
  color: #059669;
}
</style>
