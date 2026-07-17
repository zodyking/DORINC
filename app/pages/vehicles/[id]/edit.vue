<script setup lang="ts">
import type { VehicleFormValue } from '~/components/vehicles/VehicleForm.vue'

definePageMeta({ layout: 'staff' })

interface Vehicle {
  id: string
  customerId: string
  unitType: VehicleFormValue['unitType']
  busNumber: string | null
  unitTag: string | null
  vin: string | null
  plate: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  color: string | null
  odometer: string | null
  odometerUnit: 'mi' | 'hrs'
  status: 'active' | 'inactive' | 'retired'
  notes: string | null
  archivedAt: string | null
}

const route = useRoute()
const auth = useAuthStore()
const vehicleId = computed(() => String(route.params.id || ''))

const { data, error, refresh } = useClientFetch<{ vehicle: Vehicle, customer: { id: string, displayName: string } | null, registrationDocument: {
  id: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  createdAt: string
} | null }>(
  () => `/api/vehicles/${vehicleId.value}`,
  { watch: [vehicleId] },
)

const v = computed(() => data.value?.vehicle)
const registrationDocument = computed(() => data.value?.registrationDocument ?? null)
const canUpdate = computed(() => auth.can('vehicles.update.all'))
const canArchive = computed(() => auth.can('vehicles.archive.all'))

const form = reactive<VehicleFormValue>({
  customerId: '',
  unitType: 'truck',
  busNumber: '',
  unitTag: '',
  vin: '',
  plate: '',
  year: '',
  make: '',
  model: '',
  trim: '',
  color: '',
  odometer: '',
  odometerUnit: 'mi',
  status: 'active',
  notes: '',
  vinDecodeRaw: null,
})

watchEffect(() => {
  const vehicle = data.value?.vehicle
  if (!vehicle) return
  form.customerId = vehicle.customerId
  form.unitType = vehicle.unitType
  form.busNumber = vehicle.busNumber || vehicle.unitTag || ''
  form.unitTag = ''
  form.vin = vehicle.vin ?? ''
  form.plate = vehicle.plate ?? ''
  form.year = vehicle.year != null ? String(vehicle.year) : ''
  form.make = vehicle.make ?? ''
  form.model = vehicle.model ?? ''
  form.trim = vehicle.trim ?? ''
  form.color = vehicle.color ?? ''
  form.odometer = vehicle.odometer ?? ''
  form.odometerUnit = vehicle.odometerUnit ?? 'mi'
  form.status = vehicle.status ?? 'active'
  form.notes = vehicle.notes ?? ''
})

const busy = ref(false)
const saveError = ref('')
const flash = ref('')

async function submit() {
  busy.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/vehicles/${route.params.id}`, {
      method: 'PATCH',
      body: {
        unitType: form.unitType,
        busNumber: form.busNumber || null,
        unitTag: null,
        vin: form.vin || null,
        plate: form.plate || null,
        year: form.year ? Number(form.year) : null,
        make: form.make || null,
        model: form.model || null,
        trim: form.trim || null,
        color: form.color || null,
        odometer: form.odometer ? Number(form.odometer) : null,
        odometerUnit: form.odometerUnit,
        status: form.status,
        notes: form.notes || null,
        ...(form.vinDecodeRaw ? { vinDecodeRaw: form.vinDecodeRaw } : {}),
      },
    })
    await navigateTo(`/vehicles/${route.params.id}`)
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    saveError.value = fe.data?.data?.message ?? 'Could not save the vehicle — check the fields'
  }
  finally {
    busy.value = false
  }
}

async function restore() {
  busy.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/vehicles/${route.params.id}/restore`, { method: 'POST' })
    flash.value = 'Vehicle restored'
    await refresh()
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    saveError.value = fe.data?.data?.message ?? 'Could not restore vehicle'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div v-if="error || !v" class="card" style="padding:32px; text-align:center; color:#64748b;">
      Vehicle not found. <NuxtLink to="/vehicles">Back to vehicles</NuxtLink>
    </div>
    <template v-else>
      <StaffPageHead>
        <template #title>
          Edit unit
          <span v-if="v.archivedAt" class="pill gray" style="vertical-align:3px">Archived</span>
        </template>
        <template #subtitle>
          <NuxtLink to="/vehicles">Vehicles</NuxtLink> /
          <NuxtLink :to="`/vehicles/${v.id}`">{{ vehicleTag(v) }}</NuxtLink> / Edit
        </template>
        <template #actions>
          <button
            v-if="v.archivedAt && canArchive"
            type="button"
            class="btn"
            :disabled="busy"
            @click="restore"
          >
            Restore
          </button>
          <ReassignEntityButton
            v-if="!v.archivedAt"
            entity-type="vehicle"
            :entity-id="v.id"
            :entity-label="vehicleTag(v)"
            :current-customer-id="v.customerId"
            :current-customer-name="data?.customer?.displayName"
            :disabled="busy"
            @reassigned="refresh()"
          />
          <DeleteEntityButton
            v-if="!v.archivedAt"
            entity-type="vehicle"
            :entity-id="v.id"
            :entity-label="vehicleTag(v)"
            :disabled="busy"
            @submitted="flash = 'Deletion request submitted for admin review'"
          />
        </template>
      </StaffPageHead>
      <p v-if="flash" class="flash ok" style="margin:-8px 0 16px;">{{ flash }}</p>
      <VehiclesVehicleForm
        v-model="form"
        :busy="busy"
        :error="saveError"
        submit-label="Save unit"
        @submit="submit"
        @cancel="navigateTo(`/vehicles/${route.params.id}`)"
      />
      <DocumentsEntityDocumentUploadPanel
        v-if="canUpdate"
        category="vehicle_registration"
        :document="registrationDocument"
        :upload-url="`/api/vehicles/${v.id}/documents/registration`"
        :remove-url="`/api/vehicles/${v.id}/documents/registration`"
        :can-manage="canUpdate"
        @uploaded="refresh()"
        @removed="refresh()"
      />
    </template>
  </section>
</template>
