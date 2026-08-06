<script setup lang="ts">
import { vehicleSub, vehicleTag } from '~/utils/vehicles-ui'

// Mobile-first photo service log wizard — customer, vehicle, dates, symptoms + photos.
definePageMeta({ layout: 'staff' })

interface CustomerPick {
  id: string
  displayName: string
  accountKind: string
  vehicleCount?: number
}

interface VehiclePick {
  id: string
  unitType: string
  busNumber: string | null
  unitTag: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
}

const auth = useAuthStore()
if (import.meta.client && auth.loaded && !auth.can('service_logs.upload.own')) {
  navigateTo('/service-logs')
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`)
  if (!Number.isFinite(d.getTime())) return iso
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const step = ref(1)
const busy = ref(false)
const submitError = ref('')

const customerId = ref('')
const vehicleId = ref('')
const invoiceDate = ref(todayIso())
const dueDate = ref(addDaysIso(todayIso(), 30))
const complaint = ref('')
const photos = ref<{ file: File, preview: string }[]>([])

watch(invoiceDate, (value) => {
  if (!value) return
  // Keep due date at least the invoice date when the invoice date moves forward.
  if (!dueDate.value || dueDate.value < value) {
    dueDate.value = addDaysIso(value, 30)
  }
})

const { data: customersData } = useClientFetch<{ items: CustomerPick[] }>(
  '/api/customers',
  { query: { pageSize: 100, sort: 'name-asc' } },
)

const customerOptions = computed(() => customersData.value?.items ?? [])

const { data: vehiclesData, refresh: refreshVehicles } = useClientFetch<{ items: VehiclePick[] }>(
  '/api/vehicles',
  {
    query: computed(() => ({
      customerId: customerId.value || undefined,
      pageSize: 100,
      sort: 'tag-asc',
    })),
  },
)

watch(customerId, () => {
  vehicleId.value = ''
  refreshVehicles()
})

const vehicleOptions = computed(() => vehiclesData.value?.items ?? [])
const selectedCustomer = computed(() => customerOptions.value.find(c => c.id === customerId.value))
const selectedVehicle = computed(() => vehicleOptions.value.find(v => v.id === vehicleId.value))

const steps = [
  { n: 1, label: 'Customer' },
  { n: 2, label: 'Vehicle' },
  { n: 3, label: 'Dates' },
  { n: 4, label: 'Log' },
  { n: 5, label: 'Submit' },
]

const SERVICE_LOG_NARRATIONS: Record<number, string> = {
  1: 'Pick customer.',
  2: 'Pick vehicle.',
  3: 'Enter invoice and due dates.',
  4: 'Add symptoms and photos.',
  5: 'Review and submit.',
}

useWizardStepNarration(step, SERVICE_LOG_NARRATIONS)

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function onPhotoPick(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  for (const file of Array.from(input.files)) {
    photos.value.push({ file, preview: URL.createObjectURL(file) })
  }
  input.value = ''
}

function removePhoto(index: number) {
  URL.revokeObjectURL(photos.value[index]!.preview)
  photos.value.splice(index, 1)
}

function nextStep() {
  if (step.value < 5) step.value += 1
}

function prevStep() {
  if (step.value > 1) step.value -= 1
}

const canContinueDates = computed(() =>
  !!invoiceDate.value && !!dueDate.value && dueDate.value >= invoiceDate.value,
)

async function uploadPhotos(logId: string) {
  for (const p of photos.value) {
    const body = new FormData()
    body.append('file', p.file, p.file.name)
    body.append('ownerEntityType', 'service_log')
    body.append('ownerEntityId', logId)
    body.append('fileKind', 'original')
    await $fetch('/api/files', { method: 'POST', body })
  }
}

async function submitLog() {
  if (!customerId.value || !vehicleId.value || !canContinueDates.value) return
  busy.value = true
  submitError.value = ''
  try {
    const { log } = await $fetch<{ log: { id: string, logNumber: number } }>('/api/service-logs', {
      method: 'POST',
      body: {
        customerId: customerId.value,
        vehicleId: vehicleId.value,
        serviceDate: invoiceDate.value,
        dueDate: dueDate.value,
        complaint: complaint.value.trim() || null,
        finalize: true,
      },
    })

    if (photos.value.length) await uploadPhotos(log.id)
    await navigateTo(`/service-logs/${log.id}`)
  }
  catch (e: unknown) {
    submitError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Submit failed'
  }
  finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  for (const p of photos.value) URL.revokeObjectURL(p.preview)
})
</script>

<template>
  <section class="page active sl-page">
    <StaffPageHead subtitle="Photo service log · customer, vehicle, dates, symptoms">
      <template #title>New service log</template>
      <template #actions>
        <NuxtLink to="/service-logs" class="btn">Cancel</NuxtLink>
      </template>
    </StaffPageHead>

    <div class="sl-progress" aria-label="Progress">
      <div
        v-for="s in steps"
        :key="s.n"
        class="sl-step"
        :class="{ on: step === s.n, done: step > s.n }"
      >
        <div class="dot">{{ s.n }}</div>{{ s.label }}
      </div>
    </div>

    <div v-show="step === 1" class="sl-panel active">
      <h3>Which customer?</h3>
      <p class="sl-hint">Select the account this service was performed for.</p>
      <div class="sl-picks">
        <button
          v-for="c in customerOptions"
          :key="c.id"
          type="button"
          class="sl-pick"
          :class="{ on: customerId === c.id }"
          @click="customerId = c.id"
        >
          <span class="av teal">{{ initials(c.displayName) }}</span>
          <span class="nm">
            <b>{{ c.displayName }}</b>
            <small>{{ c.accountKind === 'fleet' ? 'Fleet' : 'Individual' }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
      <div class="sl-foot">
        <button type="button" class="btn" disabled>Back</button>
        <button type="button" class="btn primary" :disabled="!customerId" @click="nextStep">Continue</button>
      </div>
    </div>

    <div v-show="step === 2" class="sl-panel active">
      <h3>Which vehicle?</h3>
      <p class="sl-hint">Pick the unit that was serviced.</p>
      <div v-if="vehicleOptions.length" class="sl-picks">
        <button
          v-for="v in vehicleOptions"
          :key="v.id"
          type="button"
          class="sl-pick"
          :class="{ on: vehicleId === v.id }"
          @click="vehicleId = v.id"
        >
          <span class="av indigo">{{ (v.busNumber ?? v.unitTag ?? 'U').slice(0, 2) }}</span>
          <span class="nm">
            <b>{{ vehicleTag(v) }}</b>
            <small>{{ vehicleSub(v) }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
      <div v-else class="sl-empty-veh">No vehicles for this customer yet.</div>
      <div class="sl-foot">
        <button type="button" class="btn" @click="prevStep">Back</button>
        <button type="button" class="btn primary" :disabled="!vehicleId" @click="nextStep">Continue</button>
      </div>
    </div>

    <div v-show="step === 3" class="sl-panel active">
      <h3>Invoice dates</h3>
      <p class="sl-hint">These dates carry onto the invoice when this log is sent.</p>
      <label class="fld">
        <span>Invoice date</span>
        <input v-model="invoiceDate" type="date" required>
      </label>
      <label class="fld">
        <span>Due date</span>
        <input v-model="dueDate" type="date" required :min="invoiceDate || undefined">
      </label>
      <p v-if="invoiceDate && dueDate && dueDate < invoiceDate" class="help" style="color:#dc2626;">
        Due date must be on or after the invoice date.
      </p>
      <div class="sl-foot">
        <button type="button" class="btn" @click="prevStep">Back</button>
        <button type="button" class="btn primary" :disabled="!canContinueDates" @click="nextStep">Continue</button>
      </div>
    </div>

    <div v-show="step === 4" class="sl-panel active">
      <h3>Symptoms &amp; photos</h3>
      <p class="sl-hint">Capture the customer complaint, then photograph the paper service log.</p>
      <label class="fld">
        <span>Vehicle symptoms / customer complaint</span>
        <textarea
          v-model="complaint"
          rows="4"
          placeholder="What the customer or driver reported…"
        />
      </label>

      <label class="sl-photo-zone">
        <input type="file" accept="image/*" capture="environment" multiple @change="onPhotoPick">
        <div class="sl-photo-inner">
          <span class="ico" aria-hidden="true">📷</span>
          <b>Tap to add photos</b>
          <span>JPG, PNG · multiple pages OK</span>
        </div>
      </label>
      <div v-if="photos.length" class="sl-photo-grid">
        <div v-for="(p, i) in photos" :key="i" class="sl-photo-item">
          <img :src="p.preview" alt="Service log photo">
          <button type="button" class="rm" aria-label="Remove photo" @click="removePhoto(i)">×</button>
        </div>
      </div>

      <div class="sl-foot">
        <button type="button" class="btn" @click="prevStep">Back</button>
        <button type="button" class="btn primary" @click="nextStep">Continue</button>
      </div>
    </div>

    <div v-show="step === 5" class="sl-panel active">
      <h3>Review &amp; submit</h3>
      <p class="sl-hint">Confirm details before sending to the review queue.</p>
      <div class="sl-review">
        <div class="r"><span class="k">Customer</span><span class="v">{{ selectedCustomer?.displayName ?? '—' }}</span></div>
        <div class="r"><span class="k">Vehicle</span><span class="v">{{ selectedVehicle ? vehicleTag(selectedVehicle) : '—' }}</span></div>
        <div class="r"><span class="k">Invoice date</span><span class="v">{{ invoiceDate }}</span></div>
        <div class="r"><span class="k">Due date</span><span class="v">{{ dueDate }}</span></div>
        <div class="r stack"><span class="k">Symptoms / complaint</span><span class="v">{{ complaint.trim() || '—' }}</span></div>
        <div class="r">
          <span class="k">Photos</span>
          <span class="v">{{ photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'None yet' }}</span>
        </div>
      </div>
      <p v-if="submitError" class="help" style="color:#dc2626;">{{ submitError }}</p>
      <div class="sl-foot">
        <button type="button" class="btn" :disabled="busy" @click="prevStep">Back</button>
        <button type="button" class="btn primary" :disabled="busy" @click="submitLog">
          {{ busy ? 'Submitting…' : 'Submit log' }}
        </button>
      </div>
    </div>
  </section>
</template>
