<script setup lang="ts">
import { TRAINING_CUSTOMERS, TRAINING_VEHICLES } from '#shared/training-fixtures'
import { useTrainingPracticeSession } from '~/composables/useTrainingPracticeSession'
import { vehicleSub, vehicleTag } from '~/utils/vehicles-ui'
import { logNumberDisplay } from '~/utils/service-logs-ui'

const props = defineProps<{
  practiceId: string
}>()

const emit = defineEmits<{
  ready: [ready: boolean]
}>()

const { serviceLog } = useTrainingPracticeSession()

const customers = TRAINING_CUSTOMERS
const vehiclesForCustomer = computed(() =>
  TRAINING_VEHICLES.filter(v => v.customerId === serviceLog.customerId),
)

const selectedCustomer = computed(() => customers.find(c => c.id === serviceLog.customerId))
const selectedVehicle = computed(() => TRAINING_VEHICLES.find(v => v.id === serviceLog.vehicleId))

const wizardSteps = [
  { n: 1, label: 'Customer' },
  { n: 2, label: 'Vehicle' },
  { n: 3, label: 'Dates' },
  { n: 4, label: 'Log' },
  { n: 5, label: 'Submit' },
]

const activeWizardStep = computed(() => {
  const map: Record<string, number> = {
    'sl-customer': 1,
    'sl-vehicle': 2,
    'sl-when': 3,
    'sl-dates': 3,
    'sl-work': 4,
    'sl-log-photo': 4,
    'sl-log-voice': 4,
    'sl-review-photo': 5,
    'sl-review-voice': 5,
    'sl-submit-photo': 5,
    'sl-submit-voice': 5,
  }
  return map[props.practiceId] ?? 1
})

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function addPracticePhoto() {
  serviceLog.photoAdded = true
  serviceLog.logMode = 'upload'
}

const ready = computed(() => {
  switch (props.practiceId) {
    case 'sl-customer':
      return !!serviceLog.customerId
    case 'sl-vehicle':
      return !!serviceLog.vehicleId
    case 'sl-when':
    case 'sl-dates':
      return !!serviceLog.serviceDate && !!serviceLog.dueDate && serviceLog.dueDate >= serviceLog.serviceDate
    case 'sl-work':
      return !!serviceLog.complaint.trim()
    case 'sl-log-photo':
    case 'sl-log-voice':
      return !!serviceLog.complaint.trim() && serviceLog.photoAdded
    case 'sl-review-photo':
    case 'sl-review-voice':
      return true
    case 'sl-submit-photo':
    case 'sl-submit-voice':
      return serviceLog.mockSubmitted
    default:
      return false
  }
})

watch(ready, (v) => emit('ready', v), { immediate: true })

function mockSubmit() {
  serviceLog.mockSubmitted = true
}
</script>

<template>
  <div class="training-practice-wizard">
    <div class="training-practice-badge">Practice mode — nothing is saved to production</div>

    <div class="sl-progress" aria-label="Service log wizard progress">
      <div
        v-for="s in wizardSteps"
        :key="s.n"
        class="sl-step"
        :class="{ on: activeWizardStep === s.n, done: activeWizardStep > s.n }"
      >
        <div class="dot">{{ s.n }}</div>{{ s.label }}
      </div>
    </div>

    <div v-if="practiceId === 'sl-customer'" class="sl-panel active">
      <h3>Which customer?</h3>
      <p class="sl-hint">Select the account this service was performed for.</p>
      <div class="sl-picks">
        <button
          v-for="c in customers"
          :key="c.id"
          type="button"
          class="sl-pick"
          :class="{ on: serviceLog.customerId === c.id }"
          @click="serviceLog.customerId = c.id; serviceLog.vehicleId = ''"
        >
          <span class="av teal">{{ initials(c.displayName) }}</span>
          <span class="nm">
            <b>{{ c.displayName }}</b>
            <small>{{ c.accountKind === 'fleet' ? 'Fleet' : 'Individual' }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
    </div>

    <div v-else-if="practiceId === 'sl-vehicle'" class="sl-panel active">
      <h3>Which vehicle?</h3>
      <p class="sl-hint">
        Customer: <strong>{{ selectedCustomer?.displayName ?? '—' }}</strong>. Pick the unit that was serviced.
      </p>
      <div v-if="vehiclesForCustomer.length" class="sl-picks">
        <button
          v-for="v in vehiclesForCustomer"
          :key="v.id"
          type="button"
          class="sl-pick"
          :class="{ on: serviceLog.vehicleId === v.id }"
          @click="serviceLog.vehicleId = v.id"
        >
          <span class="av indigo">{{ (v.busNumber ?? v.unitTag ?? 'U').slice(0, 2) }}</span>
          <span class="nm">
            <b>{{ vehicleTag(v) }}</b>
            <small>{{ vehicleSub(v) }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
      <div v-else class="sl-empty-veh">Select a customer on the previous step first.</div>
    </div>

    <div v-else-if="practiceId === 'sl-when' || practiceId === 'sl-dates'" class="sl-panel active">
      <h3>Invoice dates</h3>
      <p class="sl-hint">These dates carry onto the invoice when this log is sent.</p>
      <label class="fld"><span>Invoice date</span><input v-model="serviceLog.serviceDate" type="date" required></label>
      <label class="fld"><span>Due date</span><input v-model="serviceLog.dueDate" type="date" required></label>
    </div>

    <div
      v-else-if="practiceId === 'sl-work' || practiceId === 'sl-log-photo' || practiceId === 'sl-log-voice'"
      class="sl-panel active"
    >
      <h3>Symptoms &amp; photos</h3>
      <p class="sl-hint">Capture the customer complaint, then attach a practice photo of the paperwork.</p>
      <label class="fld"><span>Vehicle symptoms / customer complaint</span>
        <textarea v-model="serviceLog.complaint" rows="3" placeholder="What the customer or driver reported…" />
      </label>
      <button v-if="!serviceLog.photoAdded" type="button" class="btn primary" @click="addPracticePhoto">
        Add practice photo
      </button>
      <div v-else class="sl-photo-grid">
        <div class="sl-photo-item">
          <div class="training-practice-photo-placeholder">Practice sheet</div>
        </div>
      </div>
    </div>

    <div v-else-if="practiceId === 'sl-review-photo' || practiceId === 'sl-review-voice'" class="sl-panel active">
      <h3>Review your practice log</h3>
      <p class="sl-hint">Confirm everything looks right before the final submit step.</p>
      <div class="sl-review">
        <div class="r"><span class="k">Customer</span><span class="v">{{ selectedCustomer?.displayName ?? '—' }}</span></div>
        <div class="r"><span class="k">Vehicle</span><span class="v">{{ selectedVehicle ? vehicleTag(selectedVehicle) : '—' }}</span></div>
        <div class="r"><span class="k">Invoice date</span><span class="v">{{ serviceLog.serviceDate }}</span></div>
        <div class="r"><span class="k">Due date</span><span class="v">{{ serviceLog.dueDate }}</span></div>
        <div class="r stack"><span class="k">Symptoms / complaint</span><span class="v">{{ serviceLog.complaint || '—' }}</span></div>
        <div class="r"><span class="k">Photos</span><span class="v">{{ serviceLog.photoAdded ? '1 photo' : 'None' }}</span></div>
      </div>
    </div>

    <div v-else-if="practiceId === 'sl-submit-photo' || practiceId === 'sl-submit-voice'" class="sl-panel active">
      <h3>Submit practice log</h3>
      <p class="sl-hint">Tap submit to finish the practice run. No real log is created.</p>
      <div v-if="!serviceLog.mockSubmitted" class="training-practice-submit-box">
        <p>Ready to send <strong>{{ logNumberDisplay(9999) }}</strong> (practice) to the review queue?</p>
        <button type="button" class="btn primary" @click="mockSubmit">Submit log (practice)</button>
      </div>
      <div v-else class="training-practice-success">
        <span class="training-card-icon" style="width:48px;height:48px;font-size:1.5rem;">✓</span>
        <p><strong>Practice log submitted!</strong> In production this moves to <em>Ready to invoice</em> for office review.</p>
      </div>
    </div>

    <p v-if="!ready" class="training-practice-hint help">
      Complete the fields above to unlock Continue.
    </p>
  </div>
</template>
