<script setup lang="ts">
import { vehicleSub, vehicleTag } from '~/utils/vehicles-ui'

const props = withDefaults(defineProps<{
  entityType?: 'invoice' | 'service_log'
  entityId: string
  customerId: string | null
  currentVehicleId?: string | null
  buttonClass?: string
  disabled?: boolean
  /** When true, owner/reviewer may change unit on editable service logs without records.reassign.all */
  allowEdit?: boolean
}>(), {
  entityType: 'invoice',
  currentVehicleId: null,
  buttonClass: 'btn',
  disabled: false,
  allowEdit: false,
})

const emit = defineEmits<{ changed: [] }>()

const auth = useAuthStore()
const canChange = computed(() => {
  if (!auth.loaded) return false
  if (auth.can('records.reassign.all')) return true
  return props.entityType === 'service_log' && props.allowEdit
})

interface VehiclePick {
  id: string
  unitType: string
  busNumber: string | null
  unitTag: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  vin: string | null
}

const open = ref(false)
const vehicleId = ref('')
const reason = ref('')
const busy = ref(false)
const error = ref('')

const {
  data: vehiclesData,
  refresh: refreshVehicles,
  pending: vehiclesPending,
} = useFetch<{ items: VehiclePick[] }>('/api/vehicles', {
  query: computed(() => ({
    customerId: props.customerId || undefined,
    pageSize: 100,
    sort: 'tag-asc',
  })),
  lazy: true,
  server: false,
  immediate: false,
  watch: false,
})

const vehicles = computed(() => vehiclesData.value?.items ?? [])
const isServiceLog = computed(() => props.entityType === 'service_log')
const requiresVehicle = computed(() => isServiceLog.value)

const buttonLabel = computed(() => {
  if (isServiceLog.value) return props.currentVehicleId ? 'Change unit' : 'Select unit'
  return props.currentVehicleId ? 'Change unit' : 'Add unit'
})

const modalTitle = computed(() =>
  isServiceLog.value ? 'Change unit on this service log' : 'Change unit on this invoice',
)

const helpText = computed(() =>
  isServiceLog.value
    ? 'Pick a different unit for this customer. To move the log to another customer, use Reassign.'
    : 'Attach a different unit or clear the unit. Only units belonging to this invoice\'s customer are shown.',
)

const selectedVehicle = computed(() => vehicles.value.find(v => v.id === vehicleId.value) ?? null)

const selectedHelp = computed(() => {
  if (!selectedVehicle.value) {
    if (!requiresVehicle.value && vehicleId.value === '') return 'No unit will be attached to this invoice.'
    return ''
  }
  const parts: string[] = [vehicleSub(selectedVehicle.value)]
  if (selectedVehicle.value.vin) parts.push(`VIN ${selectedVehicle.value.vin}`)
  return parts.join(' · ')
})

const apiPath = computed(() =>
  isServiceLog.value
    ? `/api/service-logs/${props.entityId}/reassign-vehicle`
    : `/api/invoices/${props.entityId}/reassign-vehicle`,
)

async function openModal() {
  if (!props.customerId) {
    error.value = isServiceLog.value
      ? 'This service log has no customer assigned.'
      : 'Assign a customer to this invoice before attaching a unit.'
    open.value = true
    return
  }
  error.value = ''
  reason.value = ''
  vehicleId.value = props.currentVehicleId ?? ''
  open.value = true
  await refreshVehicles()
}

async function submit() {
  if (requiresVehicle.value && !vehicleId.value) {
    error.value = 'Select a unit.'
    return
  }
  if (requiresVehicle.value && vehicleId.value === props.currentVehicleId) {
    error.value = 'Choose a different unit.'
    return
  }

  busy.value = true
  error.value = ''
  try {
    await $fetch(apiPath.value, {
      method: 'POST',
      body: {
        vehicleId: requiresVehicle.value ? vehicleId.value : (vehicleId.value || null),
        reason: reason.value.trim() || undefined,
      },
    })
    open.value = false
    emit('changed')
  }
  catch (e: unknown) {
    const err = e as { data?: { message?: string, data?: { message?: string } } }
    error.value = err.data?.data?.message ?? err.data?.message ?? 'Could not update the unit'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <button
    v-if="canChange"
    type="button"
    :class="buttonClass"
    :disabled="disabled || busy"
    @click="openModal"
  >
    {{ buttonLabel }}
  </button>

  <Teleport to="body">
    <div v-if="open" class="modal-scrim open" @click.self="open = false">
      <div class="card modal-card" style="max-width:520px; width:100%;">
        <div class="chead"><h3>{{ modalTitle }}</h3></div>
        <div class="cbody">
          <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
            {{ helpText }}
          </p>

          <label class="fld">
            Unit
            <select v-model="vehicleId" :disabled="!customerId || vehiclesPending" :required="requiresVehicle">
              <option v-if="!requiresVehicle" value="">No unit / clear unit</option>
              <option v-else value="" disabled>Select unit…</option>
              <option
                v-for="v in vehicles"
                :key="v.id"
                :value="v.id"
                :disabled="v.id === currentVehicleId"
              >
                {{ vehicleTag(v) }} — {{ vehicleSub(v) }}
              </option>
            </select>
            <span v-if="selectedHelp" class="help">{{ selectedHelp }}</span>
            <span v-else-if="vehiclesPending" class="help">Loading units…</span>
            <span v-else-if="customerId && !vehicles.length" class="help">This customer has no units on file.</span>
          </label>

          <label class="fld">
            Reason (optional)
            <textarea v-model="reason" rows="2" placeholder="Why is the unit changing?" />
          </label>

          <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button type="button" class="btn primary" :disabled="busy || !customerId" @click="submit">
              {{ busy ? 'Saving…' : 'Save unit' }}
            </button>
            <button type="button" class="btn" :disabled="busy" @click="open = false">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
