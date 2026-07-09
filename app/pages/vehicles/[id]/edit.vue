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
}

const route = useRoute()

const { data, error } = await useFetch<{ vehicle: Vehicle, customer: { id: string, displayName: string } | null }>(
  `/api/vehicles/${route.params.id}`,
)

const v = data.value?.vehicle

const form = reactive<VehicleFormValue>({
  customerId: v?.customerId ?? '',
  unitType: v?.unitType ?? 'truck',
  busNumber: v?.busNumber || v?.unitTag || '',
  unitTag: '',
  vin: v?.vin ?? '',
  plate: v?.plate ?? '',
  year: v?.year != null ? String(v.year) : '',
  make: v?.make ?? '',
  model: v?.model ?? '',
  trim: v?.trim ?? '',
  color: v?.color ?? '',
  odometer: v?.odometer ?? '',
  odometerUnit: v?.odometerUnit ?? 'mi',
  status: v?.status ?? 'active',
  notes: v?.notes ?? '',
  vinDecodeRaw: null,
})

const busy = ref(false)
const saveError = ref('')

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
</script>

<template>
  <section class="page active">
    <div v-if="error || !v" class="card" style="padding:32px; text-align:center; color:#64748b;">
      Vehicle not found. <NuxtLink to="/vehicles">Back to vehicles</NuxtLink>
    </div>
    <template v-else>
      <div class="pagehead">
        <div>
          <h2>Edit unit</h2>
          <p>
            <NuxtLink to="/vehicles">Vehicles</NuxtLink> /
            <NuxtLink :to="`/vehicles/${v.id}`">{{ vehicleTag(v) }}</NuxtLink> / Edit
          </p>
        </div>
      </div>
      <VehiclesVehicleForm
        v-model="form"
        :busy="busy"
        :error="saveError"
        submit-label="Save unit"
        @submit="submit"
        @cancel="navigateTo(`/vehicles/${route.params.id}`)"
      />
    </template>
  </section>
</template>
