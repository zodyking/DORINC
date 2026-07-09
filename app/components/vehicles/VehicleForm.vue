<script setup lang="ts">
// Vehicle create/edit form with VIN decode (mockup: Add vehicle modal fields + PAGE: VEHICLES).
export interface VehicleFormValue {
  customerId: string
  unitType: 'truck' | 'bus' | 'equipment' | 'tractor' | 'other'
  busNumber: string
  unitTag: string
  vin: string
  plate: string
  year: string
  make: string
  model: string
  trim: string
  color: string
  odometer: string
  odometerUnit: 'mi' | 'hrs'
  status: 'active' | 'inactive' | 'retired'
  notes: string
  vinDecodeRaw: Record<string, unknown> | null
}

const model = defineModel<VehicleFormValue>({ required: true })

const props = defineProps<{
  busy?: boolean
  submitLabel: string
  error?: string
  /** Provided only when creating — locked on edit. */
  customers?: { id: string, displayName: string }[]
}>()

const emit = defineEmits<{ submit: [], cancel: [] }>()

/** School-bus fleet default paint code. */
const BUS_DEFAULT_COLOR = 'YW'

watch(() => model.value.unitType, (type, prev) => {
  if (type === 'bus' && !model.value.color.trim()) {
    model.value.color = BUS_DEFAULT_COLOR
  }
  else if (prev === 'bus' && type !== 'bus' && model.value.color.trim() === BUS_DEFAULT_COLOR) {
    model.value.color = ''
  }
})

// ---- VIN decode (P1-11) ----
const decoding = ref(false)
const decodeNote = ref('')
const decodeErr = ref('')

interface DecodeResponse {
  normalized: {
    vin: string
    year: number | null
    make: string | null
    model: string | null
    trim: string | null
    bodyClass: string | null
    engine: string | null
    fuelType: string | null
    errorText: string | null
  }
  raw: Record<string, unknown>
}

async function decodeVin() {
  if (!model.value.vin || decoding.value) return
  decoding.value = true
  decodeNote.value = ''
  decodeErr.value = ''
  try {
    const { normalized, raw } = await $fetch<DecodeResponse>('/api/vehicles/decode-vin', {
      method: 'POST',
      body: { vin: model.value.vin },
    })
    model.value.vin = normalized.vin
    if (normalized.year) model.value.year = String(normalized.year)
    if (normalized.make) model.value.make = normalized.make
    if (normalized.model) model.value.model = normalized.model
    if (normalized.trim) model.value.trim = normalized.trim
    model.value.vinDecodeRaw = raw
    decodeNote.value = normalized.errorText
      ? `Decoded with warnings: ${normalized.errorText}`
      : [normalized.year, normalized.make, normalized.model].filter(Boolean).join(' ')
        ? `Decoded — ${[normalized.year, normalized.make, normalized.model].filter(Boolean).join(' ')}`
        : 'Decode returned no vehicle data for this VIN'
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    decodeErr.value = fe.data?.data?.message ?? 'VIN decode failed — check the VIN'
  }
  finally {
    decoding.value = false
  }
}
</script>

<template>
  <form @submit.prevent="emit('submit')">
    <div class="cols">
      <div class="stack">
        <div class="card">
          <div class="chead"><h3>Unit</h3></div>
          <div class="cbody">
            <label v-if="props.customers" class="fld">Customer <span style="color:#dc2626">*</span>
              <select v-model="model.customerId" required>
                <option value="" disabled>Select a customer…</option>
                <option v-for="c in props.customers" :key="c.id" :value="c.id">{{ c.displayName }}</option>
              </select>
            </label>
            <label class="fld">Fleet tag
              <input v-model="model.busNumber" type="text" placeholder="e.g. HL-120, Bus #43">
              <span class="help">How the team identifies this unit — unique per customer</span>
            </label>
            <label class="fld">Unit type
              <select v-model="model.unitType">
                <option value="truck">Truck</option>
                <option value="bus">Bus</option>
                <option value="equipment">Equipment</option>
                <option value="tractor">Tractor</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label class="fld">Status
              <select v-model="model.status">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="retired">Retired</option>
              </select>
            </label>
          </div>
        </div>
        <div class="card">
          <div class="chead"><h3>Notes</h3></div>
          <div class="cbody">
            <label class="fld">Internal notes <textarea v-model="model.notes" placeholder="Assigned driver, special equipment, known issues…" /></label>
          </div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="chead"><h3>Identification</h3></div>
          <div class="cbody">
            <label class="fld">VIN
              <div class="vin-row">
                <input v-model="model.vin" type="text" maxlength="17" placeholder="17-character VIN" class="mono" style="font-size:13px;">
                <button type="button" class="btn" :disabled="decoding || !model.vin" @click="decodeVin">
                  {{ decoding ? 'Decoding…' : 'Decode' }}
                </button>
              </div>
              <span class="help">Optional — decode fills year, make, and model from NHTSA</span>
              <span v-if="decodeNote" class="help" style="color:#059669;">{{ decodeNote }}</span>
              <span v-if="decodeErr" class="help" style="color:#dc2626;">{{ decodeErr }}</span>
            </label>
            <div class="row3">
              <label class="fld">Year <input v-model="model.year" type="number" min="1900" max="2100" placeholder="2022"></label>
              <label class="fld">Make <input v-model="model.make" type="text" placeholder="Freightliner"></label>
              <label class="fld">Model <input v-model="model.model" type="text" placeholder="Cascadia"></label>
            </div>
            <div class="row3">
              <label class="fld">Trim <input v-model="model.trim" type="text"></label>
              <label class="fld">Plate <input v-model="model.plate" type="text" placeholder="DE 12345"></label>
              <label class="fld">Color
                <input v-model="model.color" type="text" :placeholder="model.unitType === 'bus' ? 'YW' : 'White'">
                <span v-if="model.unitType === 'bus'" class="help">School buses default to YW</span>
              </label>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="chead"><h3>Meter</h3></div>
          <div class="cbody">
            <div class="row2odo">
              <label class="fld">Odometer / hours <input v-model="model.odometer" type="number" min="0" step="0.1" placeholder="412806"></label>
              <label class="fld">Reading in
                <select v-model="model.odometerUnit">
                  <option value="mi">Miles</option>
                  <option value="hrs">Hours</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p v-if="error" style="color:#dc2626; font-size:13px; margin:12px 0 0;">{{ error }}</p>
    <div class="form-footer">
      <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'Saving…' : submitLabel }}</button>
      <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">Cancel</button>
      <slot name="footer-extra" />
    </div>
  </form>
</template>

<style scoped>
.row3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
.row2odo {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
}
@media (max-width: 480px) {
  .row3 {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
