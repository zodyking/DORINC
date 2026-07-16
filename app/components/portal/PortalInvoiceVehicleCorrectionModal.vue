<script setup lang="ts">
import {
  portalInvoiceVehicleCorrectionFormFromVehicle,
  portalInvoiceVehicleCorrectionHasChanges,
  portalInvoiceVehicleCorrectionRequestBody,
} from '~/utils/portal-invoices-ui'
import { vehicleTag, vehicleSub, type VehicleDisplay } from '~/utils/vehicles-ui'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  invoiceId: string
  invoiceNumberFormatted: string
  vehicle: (VehicleDisplay & {
    vin?: string | null
    plate?: string | null
    odometer?: string | null
  }) | null
}>()

const emit = defineEmits<{ submitted: [] }>()

const form = ref({
  unitNumber: '',
  year: '',
  make: '',
  model: '',
  vin: '',
  plate: '',
  odometer: '',
  notes: '',
})
const submitting = ref(false)
const error = ref('')
const success = ref('')

const vehicleSummary = computed(() => {
  if (!props.vehicle) return '—'
  return `${vehicleTag(props.vehicle)} · ${vehicleSub(props.vehicle)}`
})

watch(open, (isOpen) => {
  if (isOpen && props.vehicle) {
    form.value = portalInvoiceVehicleCorrectionFormFromVehicle(props.vehicle)
    error.value = ''
    success.value = ''
    submitting.value = false
  }
  else if (!isOpen) {
    form.value = {
      unitNumber: '',
      year: '',
      make: '',
      model: '',
      vin: '',
      plate: '',
      odometer: '',
      notes: '',
    }
    error.value = ''
    success.value = ''
    submitting.value = false
  }
})

function close() {
  open.value = false
}

function validate(): string | null {
  if (!props.vehicle) return 'Vehicle information could not be loaded.'
  if (!form.value.unitNumber.trim() && !form.value.make.trim() && !form.value.model.trim()) {
    return 'Unit # or make/model is required.'
  }
  if (!portalInvoiceVehicleCorrectionHasChanges(props.vehicle, form.value) && !form.value.notes.trim()) {
    return 'Change at least one field or add a note.'
  }
  return null
}

async function submit() {
  if (!props.vehicle) return
  const validationError = validate()
  if (validationError) {
    error.value = validationError
    return
  }

  submitting.value = true
  error.value = ''
  try {
    await $fetch('/api/portal/invoice-change-requests', {
      method: 'POST',
      body: portalInvoiceVehicleCorrectionRequestBody({
        invoiceId: props.invoiceId,
        invoiceNumberFormatted: props.invoiceNumberFormatted,
        vehicle: props.vehicle,
        form: form.value,
      }),
    })
    success.value = 'Submitted for review.'
    emit('submitted')
    setTimeout(() => close(), 1200)
  }
  catch (err: unknown) {
    const fe = err as { data?: { message?: string, data?: { message?: string } } }
    error.value = fe.data?.data?.message ?? fe.data?.message ?? 'Unable to submit your request.'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    class="modal-scrim"
    :class="{ open }"
    aria-hidden="true"
    @click.self="close"
  >
    <div
      v-if="vehicle"
      class="modal correction-modal"
      role="dialog"
      aria-labelledby="vehicle-correction-title"
      aria-modal="true"
    >
      <div class="mhead">
        <div>
          <h3 id="vehicle-correction-title">Correct vehicle on invoice</h3>
          <p>Current: {{ vehicleSummary }}</p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="close">✕</button>
      </div>
      <form @submit.prevent="submit">
        <div class="mbody">
          <p class="correction-lead">
            Update vehicle details for this invoice only. Your shop will review before approving.
          </p>

          <label class="fld correction-desc">
            <span>Unit #</span>
            <FleetNumberInput
              v-model="form.unitNumber"
              maxlength="80"
              autocomplete="off"
            />
          </label>

          <div class="correction-metrics correction-metrics--three">
            <label class="fld">
              <span>Year</span>
              <input v-model="form.year" type="text" inputmode="numeric" maxlength="4" autocomplete="off">
            </label>
            <label class="fld">
              <span>Make</span>
              <input v-model="form.make" type="text" maxlength="80" autocomplete="off">
            </label>
            <label class="fld">
              <span>Model</span>
              <input v-model="form.model" type="text" maxlength="80" autocomplete="off">
            </label>
          </div>

          <div class="correction-metrics">
            <label class="fld">
              <span>VIN</span>
              <input v-model="form.vin" type="text" maxlength="17" autocomplete="off" class="mono">
            </label>
            <label class="fld">
              <span>Plate</span>
              <input v-model="form.plate" type="text" maxlength="20" autocomplete="off">
            </label>
          </div>

          <label class="fld">
            <span>Odometer <span class="fld-optional">optional</span></span>
            <input v-model="form.odometer" type="text" inputmode="decimal" maxlength="20" autocomplete="off">
          </label>

          <label class="fld">
            <span>Notes <span class="fld-optional">optional</span></span>
            <textarea
              v-model="form.notes"
              rows="2"
              maxlength="2000"
              placeholder="Why should this change?"
            />
          </label>

          <p v-if="success" class="callout info">{{ success }}</p>
          <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
        </div>
        <div class="mfoot">
          <button type="button" class="btn" @click="close">Cancel</button>
          <button type="button" class="btn primary" :disabled="submitting" @click="submit">
            {{ submitting ? 'Submitting…' : 'Submit for review' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.correction-modal {
  width: min(560px, calc(100vw - 32px));
}

.correction-lead {
  margin: 0 0 16px;
  font-size: 13.5px;
  color: #64748b;
  line-height: 1.45;
}

.correction-desc {
  margin-bottom: 12px;
}

.correction-desc input {
  width: 100%;
}

.correction-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.correction-metrics--three {
  grid-template-columns: 100px 1fr 1fr;
}

.fld-optional {
  font-weight: 500;
  color: #94a3b8;
  text-transform: none;
  letter-spacing: 0;
}

@media (max-width: 480px) {
  .correction-metrics,
  .correction-metrics--three {
    grid-template-columns: 1fr;
  }
}
</style>
