<script setup lang="ts">
import type { VehicleFormValue } from '~/components/vehicles/VehicleForm.vue'

definePageMeta({ layout: 'staff' })

const route = useRoute()

const form = reactive<VehicleFormValue>({
  customerId: typeof route.query.customerId === 'string' ? route.query.customerId : '',
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

const { data: customersData } = await useFetch<{ items: { id: string, displayName: string }[] }>(
  '/api/customers',
  { query: { pageSize: 100, sort: 'name-asc' } },
)
const customers = computed(() => customersData.value?.items ?? [])

const busy = ref(false)
const error = ref('')
const formRoot = ref<HTMLElement | null>(null)

const VEHICLE_SPEECH_SECTIONS = [
  {
    selector: '[data-speech-section="unit"]',
    narration: 'Pick the customer and unit type.',
  },
  {
    selector: '[data-speech-section="identification"]',
    narration: 'Enter the VIN and basic vehicle info.',
  },
  {
    selector: '[data-speech-section="meter"]',
    narration: 'Update mileage or hours.',
  },
  {
    selector: '[data-speech-section="notes"]',
    narration: 'Anything else we should know?',
  },
]

useFormSectionSpeech(formRoot, VEHICLE_SPEECH_SECTIONS)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ vehicle: { id: string } }>('/api/vehicles', {
      method: 'POST',
      body: {
        customerId: form.customerId,
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
        vinDecodeRaw: form.vinDecodeRaw,
      },
    })
    await navigateTo(`/vehicles/${res.vehicle.id}`)
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    error.value = fe.data?.data?.message ?? 'Could not create the vehicle — check the fields'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>New vehicle</h2>
        <p><NuxtLink to="/vehicles">Vehicles</NuxtLink> / Register unit</p>
      </div>
    </div>
    <div ref="formRoot">
      <VehiclesVehicleForm
        v-model="form"
        :busy="busy"
        :error="error"
        :customers="customers"
        submit-label="Add to fleet"
        @submit="submit"
        @cancel="navigateTo('/vehicles')"
      />
    </div>
  </section>
</template>
