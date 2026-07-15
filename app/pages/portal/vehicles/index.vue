<script setup lang="ts">
// Customer portal vehicles — fleet view + new vehicle request modal (mockup: Portal Vehicles / P2-06).
import {
  PORTAL_VEHICLE_TYPE_OPTIONS,
  portalVehicleCountLabel,
  portalVehicleLastService,
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

const { data, error, pending } = useClientFetch<{ items: PortalVehicleRow[] }>('/api/portal/vehicles')

const items = computed(() => data.value?.items ?? [])

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

function resetForm() {
  form.fleetTag = ''
  form.unitType = 'tractor'
  form.vin = ''
  form.year = ''
  form.make = ''
  form.model = ''
  form.notes = ''
  submitError.value = ''
}

function openModal() {
  resetForm()
  submitSuccess.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function submitRequest() {
  submitError.value = ''
  submitting.value = true
  try {
    await $fetch('/api/portal/vehicle-requests', {
      method: 'POST',
      body: {
        fleetTag: form.fleetTag,
        unitType: form.unitType,
        vin: form.vin || null,
        year: form.year ? Number(form.year) : null,
        make: form.make || null,
        model: form.model || null,
        notes: form.notes || null,
      },
    })
    submitSuccess.value = 'Vehicle request submitted — the shop will review and add it to your fleet.'
    closeModal()
  }
  catch (err: unknown) {
    const msg = (err as { data?: { message?: string } })?.data?.message
    submitError.value = msg ?? 'Unable to submit vehicle request.'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:24px;">
      <p>Unable to load vehicles.</p>
    </div>

    <div v-else-if="pending && !items.length" class="card" style="padding:24px;">
      <p style="color:#64748b;font-size:13px;">Loading vehicles…</p>
    </div>

    <template v-else>
      <div class="pagehead">
        <div>
          <h2>Vehicles</h2>
          <p>Manage your fleet — request new units anytime; removals are handled by the shop</p>
        </div>
        <div class="actions">
          <button type="button" class="btn primary" @click="openModal">+ Add vehicle</button>
        </div>
      </div>

      <p
        v-if="submitSuccess"
        class="callout info"
        style="margin-bottom:16px;"
      >
        <span class="ico">✓</span>
        <span>{{ submitSuccess }}</span>
      </p>

      <div class="callout info">
        <span class="ico">ℹ</span>
        <div>
          <b>Request new vehicles</b> — submit fleet tag and VIN details for shop review.
          <b>Removal is not available here</b>; contact the shop to retire or transfer a unit.
        </div>
      </div>

      <div class="card">
        <div class="chead">
          <h3>Your fleet · {{ portalVehicleCountLabel(items.length) }}</h3>
          <span class="pill gray">Read-only</span>
        </div>

        <div v-if="!items.length" class="empty" style="padding:24px;color:#64748b;font-size:13px;">
          No vehicles on file yet. Use <b>+ Add vehicle</b> to submit a request.
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
              <tr v-for="veh in items" :key="veh.id">
                <td>
                  <span class="lead">{{ veh.tagLabel }}</span>
                  <span class="sub">{{ veh.unitTypeLabel }}</span>
                </td>
                <td>{{ veh.unitDescription }}</td>
                <td class="mono" style="font-size:12px">{{ veh.vin ?? '—' }}</td>
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
      <div class="modal" role="dialog" aria-labelledby="add-veh-title" aria-modal="true">
        <div class="mhead">
          <div>
            <h3 id="add-veh-title">Request new vehicle</h3>
            <p>Submit a fleet unit for shop review — available in your portal once approved</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeModal">✕</button>
        </div>
        <form @submit.prevent="submitRequest">
          <div class="mbody">
            <label class="fld">
              <span>Fleet tag <span style="color:#dc2626">*</span></span>
              <input v-model="form.fleetTag" type="text" required placeholder="e.g. Truck #HL-120">
              <span class="help">How your team identifies this unit — shown first everywhere</span>
            </label>
            <label class="fld">
              <span>Unit type</span>
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
                placeholder="17-character VIN"
                class="mono"
                style="font-size:13px;"
              >
              <span class="help">Optional — include year, make, and model if known</span>
            </label>
            <div class="row2" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
              <label class="fld">
                <span>Year</span>
                <input v-model="form.year" type="number" min="1980" max="2035" placeholder="2022">
              </label>
              <label class="fld">
                <span>Make</span>
                <input v-model="form.make" type="text" placeholder="Freightliner">
              </label>
              <label class="fld">
                <span>Model</span>
                <input v-model="form.model" type="text" placeholder="Cascadia">
              </label>
            </div>
            <label class="fld">
              <span>Notes (optional)</span>
              <textarea v-model="form.notes" rows="2" placeholder="Mileage, assigned driver, special equipment…" />
            </label>
            <p v-if="submitError" class="help" style="color:#dc2626;">{{ submitError }}</p>
            <div class="callout" style="margin:0;">
              <span class="ico">🔒</span>
              <div>Vehicles <b>cannot be deleted</b> from the portal. Contact the shop to retire, sell, or transfer a unit.</div>
            </div>
          </div>
          <div class="mfoot">
            <button type="button" class="btn" @click="closeModal">Cancel</button>
            <button type="submit" class="btn primary" :disabled="submitting">
              {{ submitting ? 'Submitting…' : 'Submit request' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>
