<script setup lang="ts">
import { TRAINING_CUSTOMERS, TRAINING_VEHICLES } from '#shared/training-fixtures'
import { PHOTO_UPLOAD_PICK, VOICE_ENTRY_PICK } from '~/utils/entry-mode-labels'
import { useTrainingPracticeSession } from '~/composables/useTrainingPracticeSession'
import { vehicleSub, vehicleTag } from '~/utils/vehicles-ui'
import { workTypeLabel, logNumberDisplay } from '~/utils/service-logs-ui'
import CommonLineItemsTable from '~/components/common/LineItemsTable.vue'

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
  { n: 3, label: 'When' },
  { n: 4, label: 'Work' },
  { n: 5, label: 'Log' },
  { n: 6, label: 'Submit' },
]

const activeWizardStep = computed(() => {
  const map: Record<string, number> = {
    'sl-customer': 1,
    'sl-vehicle': 2,
    'sl-when': 3,
    'sl-work': 4,
    'sl-log-photo': 5,
    'sl-log-voice': 5,
    'sl-review-photo': 6,
    'sl-review-voice': 6,
    'sl-submit-photo': 6,
    'sl-submit-voice': 6,
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

function addPracticeLine() {
  if (serviceLog.digitalLines.length >= 1) return
  serviceLog.digitalLines.push({
    lineType: 'labor',
    description: 'Replaced DPF sensor',
    qty: '2',
    rate: '145.00',
    amount: '290.00',
  })
  serviceLog.logMode = 'digital'
}

function removePracticeLine() {
  serviceLog.digitalLines = []
}

const ready = computed(() => {
  switch (props.practiceId) {
    case 'sl-customer':
      return !!serviceLog.customerId
    case 'sl-vehicle':
      return !!serviceLog.vehicleId
    case 'sl-when':
      return !!serviceLog.serviceDate && !!serviceLog.odometerReading.trim() && !!serviceLog.location.trim()
    case 'sl-work':
      return !!serviceLog.complaint.trim()
    case 'sl-log-photo':
      return serviceLog.logMode === 'upload' && serviceLog.photoAdded
    case 'sl-log-voice':
      return serviceLog.logMode === 'digital' && serviceLog.digitalLines.length >= 1
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

    <!-- Step 1: Customer -->
    <div v-if="practiceId === 'sl-customer'" class="sl-panel active">
      <h3>Which customer?</h3>
      <p class="sl-hint">Select the account this service was performed for. These are sample fleet accounts for practice.</p>
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

    <!-- Step 2: Vehicle -->
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

    <!-- Step 3: When -->
    <div v-else-if="practiceId === 'sl-when'" class="sl-panel active">
      <h3>When &amp; where?</h3>
      <p class="sl-hint">Service date, meter reading, and job location.</p>
      <label class="fld"><span>Service date</span><input v-model="serviceLog.serviceDate" type="date" required></label>
      <label class="fld"><span>Odometer or hours</span>
        <input v-model="serviceLog.odometerReading" type="text" placeholder="e.g. 412,806 mi or 2,148 hrs">
      </label>
      <label class="fld"><span>Job location</span>
        <input v-model="serviceLog.location" type="text" placeholder="Shop bay, customer yard, roadside…">
      </label>
    </div>

    <!-- Step 4: Work -->
    <div v-else-if="practiceId === 'sl-work'" class="sl-panel active">
      <h3>What was done?</h3>
      <p class="sl-hint">Capture the customer complaint and optional internal shop notes.</p>
      <label class="fld"><span>Work type</span>
        <select v-model="serviceLog.workType">
          <option value="preventive_maintenance">Preventive maintenance</option>
          <option value="repair">Repair / breakdown</option>
          <option value="diagnostic">Diagnostic</option>
          <option value="inspection">Inspection</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label class="fld"><span>Customer complaint / symptoms</span>
        <textarea v-model="serviceLog.complaint" rows="3" placeholder="What the customer or driver reported…" />
      </label>
      <label class="fld"><span>Internal notes <span class="fld-badge">Staff only</span></span>
        <textarea v-model="serviceLog.internalNotes" rows="2" placeholder="Parts replaced, fault codes…" />
      </label>
    </div>

    <!-- Step 5: Log photo -->
    <div v-else-if="practiceId === 'sl-log-photo'" class="sl-panel active">
      <h3>Service log — photo</h3>
      <p class="sl-hint">Choose <strong>{{ PHOTO_UPLOAD_PICK.title }}</strong>, then add a practice photo (no camera needed in training).</p>
      <div v-if="!serviceLog.logMode" class="sl-picks sl-log-modes">
        <button type="button" class="sl-pick sl-log-mode" @click="serviceLog.logMode = 'upload'">
          <span class="av indigo" aria-hidden="true">📷</span>
          <span class="nm">
            <b>{{ PHOTO_UPLOAD_PICK.title }}</b>
            <small>{{ PHOTO_UPLOAD_PICK.serviceLogDescription }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
      <div v-else class="sl-log-upload">
        <p class="sl-hint">Photograph the paper service log sheet only.</p>
        <button v-if="!serviceLog.photoAdded" type="button" class="btn primary" @click="addPracticePhoto">
          Add practice photo
        </button>
        <div v-else class="sl-photo-grid">
          <div class="sl-photo-item">
            <div class="training-practice-photo-placeholder">Practice sheet</div>
          </div>
        </div>
        <button type="button" class="btn ghost sm sl-change-mode" @click="serviceLog.logMode = null; serviceLog.photoAdded = false">
          Change method
        </button>
      </div>
    </div>

    <!-- Step 5: Log voice -->
    <div v-else-if="practiceId === 'sl-log-voice'" class="sl-panel active">
      <h3>Service log — voice</h3>
      <p class="sl-hint">
        Choose <strong>{{ VOICE_ENTRY_PICK.title }}</strong>. In the real app the microphone guides each field — here, add a practice line manually.
      </p>
      <div v-if="!serviceLog.logMode" class="sl-picks sl-log-modes">
        <button type="button" class="sl-pick sl-log-mode" @click="serviceLog.logMode = 'digital'">
          <span class="av teal" aria-hidden="true">🎙️</span>
          <span class="nm">
            <b>{{ VOICE_ENTRY_PICK.title }}</b>
            <small>{{ VOICE_ENTRY_PICK.serviceLogDescription }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
      <div v-else class="sl-log-digital">
        <button v-if="!serviceLog.digitalLines.length" type="button" class="btn primary" @click="addPracticeLine">
          Add practice line item
        </button>
        <CommonLineItemsTable v-else :lines="serviceLog.digitalLines" title="Your lines" />
        <button v-if="serviceLog.digitalLines.length" type="button" class="btn ghost sm" @click="removePracticeLine">Clear lines</button>
        <button type="button" class="btn ghost sm sl-change-mode" @click="serviceLog.logMode = null; serviceLog.digitalLines = []">
          Change method
        </button>
      </div>
    </div>

    <!-- Review -->
    <div v-else-if="practiceId === 'sl-review-photo' || practiceId === 'sl-review-voice'" class="sl-panel active">
      <h3>Review your practice log</h3>
      <p class="sl-hint">Confirm everything looks right before the final submit step.</p>
      <div class="sl-review">
        <div class="r"><span class="k">Customer</span><span class="v">{{ selectedCustomer?.displayName ?? '—' }}</span></div>
        <div class="r"><span class="k">Vehicle</span><span class="v">{{ selectedVehicle ? vehicleTag(selectedVehicle) : '—' }}</span></div>
        <div class="r"><span class="k">Service date</span><span class="v">{{ serviceLog.serviceDate }}</span></div>
        <div class="r"><span class="k">Odometer / hours</span><span class="v">{{ serviceLog.odometerReading || '—' }}</span></div>
        <div class="r"><span class="k">Location</span><span class="v">{{ serviceLog.location || '—' }}</span></div>
        <div class="r"><span class="k">Work type</span><span class="v">{{ workTypeLabel(serviceLog.workType) }}</span></div>
        <div class="r stack"><span class="k">Complaint</span><span class="v">{{ serviceLog.complaint || '—' }}</span></div>
        <div class="r"><span class="k">Log method</span>
          <span class="v">{{ practiceId === 'sl-review-photo' ? 'Photo upload' : 'Voice / digital lines' }}</span>
        </div>
      </div>
    </div>

    <!-- Submit -->
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
