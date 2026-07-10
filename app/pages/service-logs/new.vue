<script setup lang="ts">
// Mobile-first service log upload wizard (mockup: PAGE: NEW SERVICE LOG / P1-17).
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

const step = ref(1)
const busy = ref(false)
const submitError = ref('')

const customerId = ref('')
const vehicleId = ref('')
const serviceDate = ref(new Date().toISOString().slice(0, 10))
const odometerReading = ref('')
const location = ref('')
const workType = ref('repair')
const complaint = ref('')
const internalNotes = ref('')
import {
  toApiDraftLine,
  wizardLinesSummary,
  wizardLinesToNotes,
  type WizardLineDraft,
} from '~/utils/line-item-wizard-ui'

const photos = ref<{ file: File, preview: string }[]>([])
type LogRecordMode = 'upload' | 'digital' | null
const logRecordMode = ref<LogRecordMode>(null)
const digitalLineItems = ref<WizardLineDraft[]>([])
const lineWizardRef = ref<{ openWizard: () => void } | null>(null)

const { data: customersData } = await useFetch<{ items: CustomerPick[] }>(
  '/api/customers',
  { query: { pageSize: 100, sort: 'name-asc' } },
)

const customerOptions = computed(() => customersData.value?.items ?? [])

const { data: vehiclesData, refresh: refreshVehicles } = await useFetch<{ items: VehiclePick[] }>(
  '/api/vehicles',
  { query: computed(() => ({
    customerId: customerId.value || undefined,
    pageSize: 100,
    sort: 'tag-asc',
  })) },
)

watch(customerId, () => {
  vehicleId.value = ''
  refreshVehicles()
})

const vehicleOptions = computed(() => vehiclesData.value?.items ?? [])

const steps = [
  { n: 1, label: 'Customer' },
  { n: 2, label: 'Vehicle' },
  { n: 3, label: 'When' },
  { n: 4, label: 'Work' },
  { n: 5, label: 'Log' },
  { n: 6, label: 'Submit' },
]

const SERVICE_LOG_NARRATIONS: Record<number, string> = {
  1: 'Pick the customer.',
  2: 'Choose the vehicle.',
  3: 'Enter when and where the work happened.',
  4: 'Describe what you did.',
  5: 'Upload your paper log or add digital line items.',
  6: 'Double-check everything, then submit.',
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

async function openLineWizardFromGesture() {
  unlockSpeechFromUserGesture({ silent: true })
  await nextTick()
  await nextTick()
  lineWizardRef.value?.openWizard()
}

function selectLogMode(mode: Exclude<LogRecordMode, null>) {
  logRecordMode.value = mode
  if (mode === 'digital') void openLineWizardFromGesture()
}

function clearLogMode() {
  logRecordMode.value = null
}

function prevFromLogStep() {
  if (logRecordMode.value) {
    clearLogMode()
    return
  }
  prevStep()
}

function continueFromLogStep() {
  if (!logRecordMode.value) return
  if (logRecordMode.value === 'digital' && digitalLineItems.value.length) {
    const notesFromLines = wizardLinesToNotes(digitalLineItems.value)
    internalNotes.value = internalNotes.value.trim()
      ? `${internalNotes.value.trim()}\n\n${notesFromLines}`
      : notesFromLines
  }
  nextStep()
}

const logRecordSummary = computed(() => {
  if (logRecordMode.value === 'upload') {
    return photos.value.length
      ? `Paper sheet · ${photos.value.length} photo${photos.value.length === 1 ? '' : 's'}`
      : 'Paper sheet · no photos yet'
  }
  if (logRecordMode.value === 'digital') {
    return wizardLinesSummary(digitalLineItems.value, 'Digital log')
  }
  return '—'
})

function nextStep() {
  if (step.value < 6) step.value += 1
}

function prevStep() {
  if (step.value > 1) step.value -= 1
}

const selectedCustomer = computed(() => customerOptions.value.find(c => c.id === customerId.value))
const selectedVehicle = computed(() => vehicleOptions.value.find(v => v.id === vehicleId.value))

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
  if (!customerId.value || !vehicleId.value) return
  busy.value = true
  submitError.value = ''
  try {
    const { log } = await $fetch<{ log: { id: string, logNumber: number } }>('/api/service-logs', {
      method: 'POST',
      body: {
        customerId: customerId.value,
        vehicleId: vehicleId.value,
        serviceDate: serviceDate.value,
        odometerReading: odometerReading.value || null,
        location: location.value || null,
        workType: workType.value,
        complaint: complaint.value || null,
        internalNotes: internalNotes.value || null,
        draftLineItems: logRecordMode.value === 'digital' && digitalLineItems.value.length
          ? digitalLineItems.value.map(toApiDraftLine)
          : undefined,
      },
    })

    if (photos.value.length) await uploadPhotos(log.id)

    await $fetch(`/api/service-logs/${log.id}/status`, {
      method: 'POST',
      body: { status: 'ready_for_review' },
    })

    await navigateTo('/service-logs')
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
    <div class="pagehead">
      <div>
        <h2>New service log</h2>
        <p>Step-by-step field upload · saved when submitted</p>
      </div>
      <div class="actions">
        <NuxtLink to="/service-logs" class="btn">Cancel</NuxtLink>
      </div>
    </div>

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

    <!-- Step 1 -->
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

    <!-- Step 2 -->
    <div v-show="step === 2" class="sl-panel active">
      <h3>Which vehicle?</h3>
      <p class="sl-hint">Pick the fleet unit that was serviced.</p>
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

    <!-- Step 3 -->
    <div v-show="step === 3" class="sl-panel active">
      <h3>When &amp; where?</h3>
      <p class="sl-hint">Service date, meter reading, and job location.</p>
      <label class="fld"><span>Service date</span><input v-model="serviceDate" type="date" required></label>
      <label class="fld"><span>Odometer or hours</span><input v-model="odometerReading" type="text" placeholder="e.g. 412,806 mi or 2,148 hrs"></label>
      <label class="fld"><span>Job location</span><input v-model="location" type="text" placeholder="Shop bay, customer yard, roadside…"></label>
      <div class="sl-foot">
        <button type="button" class="btn" @click="prevStep">Back</button>
        <button type="button" class="btn primary" @click="nextStep">Continue</button>
      </div>
    </div>

    <!-- Step 4 -->
    <div v-show="step === 4" class="sl-panel active">
      <h3>What was done?</h3>
      <p class="sl-hint">Capture the customer complaint and your internal shop notes separately.</p>
      <label class="fld"><span>Work type</span>
        <select v-model="workType">
          <option value="preventive_maintenance">Preventive maintenance</option>
          <option value="repair">Repair / breakdown</option>
          <option value="diagnostic">Diagnostic</option>
          <option value="inspection">Inspection</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label class="fld"><span>Customer complaint / symptoms</span>
        <textarea v-model="complaint" rows="4" placeholder="What the customer or driver reported…" />
        <span class="help">Flows to the invoice PDF under Symptoms / Complaints</span>
      </label>
      <label class="fld"><span>Internal notes <span class="fld-badge">Staff only</span></span>
        <textarea v-model="internalNotes" rows="4" placeholder="Parts replaced, fault codes…" />
      </label>
      <div class="sl-foot">
        <button type="button" class="btn" @click="prevStep">Back</button>
        <button type="button" class="btn primary" @click="nextStep">Continue</button>
      </div>
    </div>

    <!-- Step 5 -->
    <div v-show="step === 5" class="sl-panel active">
      <h3>Service log</h3>
      <p v-if="!logRecordMode" class="sl-hint">
        How did you record the work? Pick one — you can change it before continuing.
      </p>

      <div v-if="!logRecordMode" class="sl-picks sl-log-modes">
        <button type="button" class="sl-pick sl-log-mode" @click="selectLogMode('upload')">
          <span class="av indigo" aria-hidden="true">📷</span>
          <span class="nm">
            <b>Photo of paper sheet</b>
            <small>Snap the handwritten service log your tech filled out</small>
          </span>
          <span class="chk" />
        </button>
        <button type="button" class="sl-pick sl-log-mode" @click="selectLogMode('digital')">
          <span class="av teal" aria-hidden="true">🎙️</span>
          <span class="nm">
            <b>Digital log</b>
            <small>Speak each line out loud — no forms to tap through</small>
          </span>
          <span class="chk" />
        </button>
      </div>

      <div v-else-if="logRecordMode === 'upload'" class="sl-log-upload">
        <p class="sl-hint">
          Photograph the paper service log sheet only — the form where the mechanic wrote down the work.
        </p>
        <label class="sl-photo-zone">
          <input type="file" accept="image/*" capture="environment" multiple @change="onPhotoPick">
          <div class="sl-photo-inner">
            <span class="ico" aria-hidden="true">📄</span>
            <b>Tap to photograph the sheet</b>
            <span>JPG, PNG · multiple pages OK</span>
          </div>
        </label>
        <div v-if="photos.length" class="sl-photo-grid">
          <div v-for="(p, i) in photos" :key="i" class="sl-photo-item">
            <img :src="p.preview" alt="Service log sheet">
            <button type="button" class="rm" aria-label="Remove photo" @click="removePhoto(i)">×</button>
          </div>
        </div>
        <button type="button" class="btn ghost sm sl-change-mode" @click="clearLogMode">Change method</button>
      </div>

      <div v-else class="sl-log-digital">
        <CommonLineItemWizard
          ref="lineWizardRef"
          v-model:lines="digitalLineItems"
          list-hint="Lines saved. Tap below to add more by voice."
        />
        <button type="button" class="btn ghost sm sl-change-mode" @click="clearLogMode">Change method</button>
      </div>

      <div class="sl-foot">
        <button type="button" class="btn" @click="prevFromLogStep">Back</button>
        <button
          type="button"
          class="btn primary"
          :disabled="!logRecordMode"
          @click="continueFromLogStep"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Step 6 -->
    <div v-show="step === 6" class="sl-panel active">
      <h3>Review &amp; submit</h3>
      <p class="sl-hint">Confirm details before sending to the review queue.</p>
      <div class="sl-review">
        <div class="r"><span class="k">Log number</span><span class="v">Assigned on submit</span></div>
        <div class="r"><span class="k">Customer</span><span class="v">{{ selectedCustomer?.displayName ?? '—' }}</span></div>
        <div class="r"><span class="k">Vehicle</span><span class="v">{{ selectedVehicle ? vehicleTag(selectedVehicle) : '—' }}</span></div>
        <div class="r"><span class="k">Service date</span><span class="v">{{ serviceDate }}</span></div>
        <div class="r"><span class="k">Odometer / hours</span><span class="v">{{ odometerReading || '—' }}</span></div>
        <div class="r"><span class="k">Location</span><span class="v">{{ location || '—' }}</span></div>
        <div class="r"><span class="k">Work type</span><span class="v">{{ workTypeLabel(workType) }}</span></div>
        <div class="r stack"><span class="k">Customer complaint</span><span class="v">{{ complaint || '—' }}</span></div>
        <div class="r stack"><span class="k">Internal notes</span><span class="v">{{ internalNotes || '—' }}</span></div>
        <div class="r"><span class="k">Service log</span><span class="v">{{ logRecordSummary }}</span></div>
        <div v-if="logRecordMode === 'digital' && digitalLineItems.length" class="sl-review-lines">
          <div v-for="(line, i) in digitalLineItems" :key="i" class="sl-review-line">
            <span :class="catalogTypePill(line.lineType)">{{ lineTypeLabel(line.lineType) }}</span>
            <span>{{ line.description }} · {{ line.qty }} × {{ line.rate }}<template v-if="line.amount"> = {{ moneyDisplay(line.amount) }}</template></span>
          </div>
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
