<script setup lang="ts">
import { vehicleTag } from '~/utils/vehicles-ui'

type ReassignEntityType = 'invoice' | 'vehicle' | 'service_log'

const props = defineProps<{
  entityType: ReassignEntityType
  entityId: string
  entityLabel: string
  currentCustomerId: string | null
  currentCustomerName?: string
  currentVehicleId?: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{ reassigned: [] }>()

const auth = useAuthStore()
const canReassign = computed(() => auth.loaded && auth.can('records.reassign.all'))

interface CustomerPick {
  id: string
  displayName: string
}

interface VehiclePick {
  id: string
  unitType: string
  busNumber: string | null
  unitTag: string | null
  year: number | null
  make: string | null
  model: string | null
}

const open = ref(false)
const customerId = ref('')
const vehicleId = ref('')
const reason = ref('')
const cascadeDraftInvoices = ref(true)
const cascadeOpenLogs = ref(true)
const busy = ref(false)
const error = ref('')

const needsVehicle = computed(() => props.entityType === 'service_log')
const allowsVehicle = computed(() => props.entityType === 'invoice' || props.entityType === 'service_log')

const {
  data: customersData,
  refresh: refreshCustomers,
} = useFetch<{ items: CustomerPick[] }>('/api/customers', {
  query: { pageSize: 200, sort: 'name-asc' },
  lazy: true,
  server: false,
  immediate: false,
})

const {
  data: vehiclesData,
  refresh: refreshVehicles,
} = useFetch<{ items: VehiclePick[] }>('/api/vehicles', {
  query: computed(() => ({
    customerId: customerId.value || undefined,
    pageSize: 100,
    sort: 'tag-asc',
  })),
  lazy: true,
  server: false,
  immediate: false,
  watch: false,
})

const customers = computed(() => customersData.value?.items ?? [])
const vehicles = computed(() => vehiclesData.value?.items ?? [])

const actionLabel = computed(() => {
  switch (props.entityType) {
    case 'vehicle': return 'Transfer unit'
    case 'invoice': return 'Reassign customer'
    case 'service_log': return 'Reassign'
    default: return 'Reassign'
  }
})

const modalTitle = computed(() => {
  switch (props.entityType) {
    case 'vehicle': return 'Transfer unit to another customer'
    case 'invoice': return 'Reassign invoice to another customer'
    case 'service_log': return 'Reassign service log'
    default: return 'Reassign record'
  }
})

const helpText = computed(() => {
  switch (props.entityType) {
    case 'vehicle':
      return 'Moves this unit to the selected customer. Optionally updates related draft invoices and open service logs.'
    case 'invoice':
      return 'Updates the billing customer on this invoice. The unit is kept when it belongs to the new customer; otherwise it is cleared.'
    case 'service_log':
      return 'Updates the customer and unit on this service log. Converted logs cannot be reassigned.'
    default:
      return ''
  }
})

watch(customerId, (id) => {
  vehicleId.value = ''
  if (id && allowsVehicle.value) void refreshVehicles()
})

async function openModal() {
  error.value = ''
  reason.value = ''
  customerId.value = ''
  vehicleId.value = props.currentVehicleId ?? ''
  cascadeDraftInvoices.value = true
  cascadeOpenLogs.value = true
  open.value = true
  await refreshCustomers()
}

async function submit() {
  if (!customerId.value) {
    error.value = 'Select a customer.'
    return
  }
  if (needsVehicle.value && !vehicleId.value) {
    error.value = 'Select a unit for this service log.'
    return
  }

  busy.value = true
  error.value = ''
  try {
    if (props.entityType === 'vehicle') {
      await $fetch(`/api/vehicles/${props.entityId}/reassign`, {
        method: 'POST',
        body: {
          customerId: customerId.value,
          reason: reason.value.trim() || undefined,
          cascade: {
            updateDraftInvoices: cascadeDraftInvoices.value,
            updateOpenServiceLogs: cascadeOpenLogs.value,
          },
        },
      })
    }
    else if (props.entityType === 'invoice') {
      const body: { customerId: string, reason?: string, vehicleId?: string } = {
        customerId: customerId.value,
        reason: reason.value.trim() || undefined,
      }
      if (vehicleId.value) body.vehicleId = vehicleId.value
      await $fetch(`/api/invoices/${props.entityId}/reassign-customer`, {
        method: 'POST',
        body,
      })
    }
    else {
      await $fetch(`/api/service-logs/${props.entityId}/reassign`, {
        method: 'POST',
        body: {
          customerId: customerId.value,
          vehicleId: vehicleId.value,
          reason: reason.value.trim() || undefined,
        },
      })
    }
    open.value = false
    emit('reassigned')
  }
  catch (e: unknown) {
    const err = e as { data?: { message?: string, data?: { message?: string } } }
    error.value = err.data?.data?.message ?? err.data?.message ?? 'Could not reassign this record'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <button
    v-if="canReassign"
    type="button"
    class="btn"
    :disabled="disabled || busy"
    @click="openModal"
  >
    {{ actionLabel }}
  </button>

  <div v-if="open" class="modal-scrim open" @click.self="open = false">
    <div class="card modal-card" style="max-width:520px; width:100%;">
      <div class="chead"><h3>{{ modalTitle }}</h3></div>
      <div class="cbody">
        <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
          <strong>{{ entityLabel }}</strong>
          <span v-if="currentCustomerName"> · currently {{ currentCustomerName }}</span>
          <br>
          {{ helpText }}
        </p>

        <label class="fld">
          New customer
          <select v-model="customerId" required>
            <option value="" disabled>Select customer…</option>
            <option
              v-for="c in customers"
              :key="c.id"
              :value="c.id"
              :disabled="c.id === currentCustomerId"
            >
              {{ c.displayName }}
            </option>
          </select>
        </label>

        <label v-if="allowsVehicle && customerId" class="fld">
          Unit
          <select v-model="vehicleId" :required="needsVehicle">
            <option v-if="!needsVehicle" value="">No unit / clear unit</option>
            <option v-else value="" disabled>Select unit…</option>
            <option v-for="v in vehicles" :key="v.id" :value="v.id">
              {{ vehicleTag(v) }}
            </option>
          </select>
        </label>

        <template v-if="entityType === 'vehicle'">
          <label class="fld" style="margin-top:8px;">
            <span style="display:flex; align-items:center; gap:8px;">
              <input v-model="cascadeDraftInvoices" type="checkbox">
              Also update invoices for this unit (except void)
            </span>
          </label>
          <label class="fld">
            <span style="display:flex; align-items:center; gap:8px;">
              <input v-model="cascadeOpenLogs" type="checkbox">
              Also update open service logs for this unit
            </span>
          </label>
        </template>

        <label class="fld">
          Reason (optional)
          <textarea v-model="reason" rows="2" placeholder="Why is this being moved?" />
        </label>

        <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button type="button" class="btn primary" :disabled="busy" @click="submit">
            {{ busy ? 'Saving…' : actionLabel }}
          </button>
          <button type="button" class="btn" :disabled="busy" @click="open = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>
