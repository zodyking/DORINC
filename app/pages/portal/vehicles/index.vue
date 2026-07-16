<script setup lang="ts">
import {
  PORTAL_VEHICLE_TYPE_OPTIONS,
  formatPortalDecodedVehicle,
  normalizePortalVin,
  portalVehicleLastService,
  portalVinLooksComplete,
  type PortalVehicleType,
} from '~/utils/portal-vehicles-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

interface PortalVehicleRow {
  id: string
  tagLabel: string
  unitTypeLabel: string
  unitDescription: string
  vin: string | null
  lastServiceDate: string | null
}

const q = ref('')

const { data, error, pending } = useClientFetch<{ items: PortalVehicleRow[] }>('/api/portal/vehicles')

const items = computed(() => data.value?.items ?? [])

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return items.value
  return items.value.filter(veh =>
    veh.tagLabel.toLowerCase().includes(needle)
    || veh.unitDescription.toLowerCase().includes(needle)
    || (veh.vin ?? '').toLowerCase().includes(needle),
  )
})

const countLabel = computed(() => {
  if (pending.value && !items.value.length) return 'Loading…'
  const n = filtered.value.length
  if (!n) return 'No vehicles'
  return `${n} vehicle${n === 1 ? '' : 's'}`
})

const showModal = ref(false)
const submitting = ref(false)
const submitError = ref('')
const submitSuccess = ref('')

const form = reactive({
  fleetTag: '',
  unitType: 'tractor' as PortalVehicleType,
  vin: '',
  year: '' as string | number,
  make: '',
  model: '',
  notes: '',
})

const decodingVin = ref(false)
const vinDecodeError = ref('')
const vinDecoded = ref(false)
const lastDecodedVin = ref('')

let decodeTimer: ReturnType<typeof setTimeout> | null = null

const decodedVehicleLabel = computed(() =>
  formatPortalDecodedVehicle(form.year, form.make, form.model),
)

function clearVinDecode() {
  vinDecoded.value = false
  lastDecodedVin.value = ''
  form.year = ''
  form.make = ''
  form.model = ''
  vinDecodeError.value = ''
}

function resetForm() {
  form.fleetTag = ''
  form.unitType = 'tractor'
  form.vin = ''
  form.notes = ''
  clearVinDecode()
  submitError.value = ''
}

function openModal() {
  resetForm()
  submitSuccess.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  if (decodeTimer) clearTimeout(decodeTimer)
}

async function runVinDecode(vin: string) {
  if (vin === lastDecodedVin.value) return
  decodingVin.value = true
  vinDecodeError.value = ''
  try {
    const { normalized } = await $fetch<{ normalized: {
      vin: string
      year: number | null
      make: string | null
      model: string | null
    } }>('/api/portal/vehicles/decode-vin', {
      method: 'POST',
      body: { vin },
    })
    form.vin = normalized.vin
    form.year = normalized.year ?? ''
    form.make = normalized.make ?? ''
    form.model = normalized.model ?? ''
    lastDecodedVin.value = normalized.vin
    vinDecoded.value = Boolean(normalized.year || normalized.make || normalized.model)
    if (!vinDecoded.value) {
      vinDecodeError.value = 'No details found for this VIN. You can still submit the request.'
    }
  }
  catch (err: unknown) {
    clearVinDecode()
    lastDecodedVin.value = vin
    const msg = (err as { data?: { message?: string, data?: { message?: string } } })?.data?.data?.message
      ?? (err as { data?: { message?: string } })?.data?.message
    vinDecodeError.value = msg ?? 'Could not look up this VIN.'
  }
  finally {
    decodingVin.value = false
  }
}

watch(() => form.vin, (raw) => {
  const vin = normalizePortalVin(raw)
  if (vin !== raw) {
    form.vin = vin
    return
  }

  if (decodeTimer) clearTimeout(decodeTimer)

  if (!portalVinLooksComplete(vin)) {
    if (lastDecodedVin.value) clearVinDecode()
    return
  }

  if (vin === lastDecodedVin.value && vinDecoded.value) return

  decodeTimer = setTimeout(() => {
    void runVinDecode(vin)
  }, 300)
})

async function submitRequest() {
  submitError.value = ''
  submitting.value = true
  try {
    await $fetch('/api/portal/vehicle-requests', {
      method: 'POST',
      body: {
        fleetTag: form.fleetTag.trim(),
        unitType: form.unitType,
        vin: form.vin || null,
        year: form.year ? Number(form.year) : null,
        make: form.make || null,
        model: form.model || null,
        notes: form.notes.trim() || null,
      },
    })
    submitSuccess.value = 'Request sent — we\'ll add the unit after review.'
    closeModal()
  }
  catch (err: unknown) {
    const msg = (err as { data?: { message?: string } })?.data?.message
    submitError.value = msg ?? 'Unable to submit request.'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="page active portal-page">
    <div v-if="error" class="card">
      <div class="empty">Unable to load vehicles.</div>
    </div>

    <template v-else>
      <PortalPageHead subtitle="Your vehicles on file with the shop">
        <template #title>Fleet</template>
        <template #actions>
          <button type="button" class="btn primary" @click="openModal">Add vehicle</button>
        </template>
      </PortalPageHead>

      <p v-if="submitSuccess" class="callout info" style="margin-bottom: 16px;">
        {{ submitSuccess }}
      </p>

      <ListFilterBar
        v-model:search="q"
        search-placeholder="Search tag, unit, VIN…"
        search-aria-label="Search fleet"
        :count-label="countLabel"
        :has-filters="false"
      />

      <div class="card">
        <div v-if="pending && !items.length" class="empty">Loading fleet…</div>
        <div v-else-if="!filtered.length" class="empty">
          No vehicles yet. Tap <b>Add vehicle</b> to request one.
        </div>
        <div v-else class="tscroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Unit</th>
                <th>VIN</th>
                <th>Last service</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="veh in filtered" :key="veh.id">
                <td>
                  <span class="lead">{{ veh.tagLabel }}</span>
                  <span class="sub">{{ veh.unitTypeLabel }}</span>
                </td>
                <td>{{ veh.unitDescription }}</td>
                <td class="mono">{{ veh.vin ?? '—' }}</td>
                <td>{{ portalVehicleLastService(veh.lastServiceDate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div
      class="modal-scrim"
      :class="{ open: showModal }"
      aria-hidden="true"
      @click.self="closeModal"
    >
      <div class="modal portal-add-vehicle-modal" role="dialog" aria-labelledby="add-veh-title" aria-modal="true">
        <div class="mhead">
          <div>
            <h3 id="add-veh-title">Add vehicle</h3>
            <p class="portal-modal-sub">We'll review and add it to your fleet.</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeModal">✕</button>
        </div>
        <form @submit.prevent="submitRequest">
          <div class="mbody">
            <label class="fld">
              <span>Unit name</span>
              <input v-model="form.fleetTag" type="text" required placeholder="Bus #616">
            </label>
            <label class="fld">
              <span>Type</span>
              <select v-model="form.unitType">
                <option
                  v-for="opt in PORTAL_VEHICLE_TYPE_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </label>
            <label class="fld">
              <span>VIN</span>
              <input
                v-model="form.vin"
                type="text"
                maxlength="17"
                placeholder="17 characters"
                class="mono"
                autocomplete="off"
                spellcheck="false"
              >
            </label>
            <p v-if="decodingVin" class="portal-vin-status">Looking up vehicle…</p>
            <p v-else-if="vinDecodeError" class="portal-vin-status warn">{{ vinDecodeError }}</p>
            <div v-if="vinDecoded" class="portal-vin-summary" aria-live="polite">
              <span class="portal-vin-summary__label">Vehicle</span>
              <span class="portal-vin-summary__value">{{ decodedVehicleLabel }}</span>
            </div>
            <label class="fld">
              <span>Notes <span class="optional">optional</span></span>
              <textarea v-model="form.notes" rows="2" placeholder="Anything else we should know?" />
            </label>
            <p v-if="submitError" class="help" style="color:#dc2626;">{{ submitError }}</p>
          </div>
          <div class="mfoot">
            <button type="button" class="btn" @click="closeModal">Cancel</button>
            <button type="submit" class="btn primary" :disabled="submitting || decodingVin">
              {{ submitting ? 'Sending…' : 'Submit' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.portal-modal-sub {
  margin: 0.25rem 0 0;
  color: #64748b;
  font-size: 0.9375rem;
}
.portal-vin-status {
  margin: -0.25rem 0 0.75rem;
  font-size: 0.875rem;
  color: #64748b;
}
.portal-vin-status.warn {
  color: #b45309;
}
.portal-vin-summary {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-bottom: 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 0.5rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.portal-vin-summary__label {
  font-size: 0.8125rem;
  color: #64748b;
}
.portal-vin-summary__value {
  font-weight: 600;
}
.optional {
  font-weight: 400;
  color: #94a3b8;
  font-size: 0.8125rem;
}
</style>
