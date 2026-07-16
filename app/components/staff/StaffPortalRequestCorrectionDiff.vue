<script setup lang="ts">
import type { PortalInvoiceCorrectionPayload } from '#shared/portal-invoice-correction'
import {
  staffCorrectionPayloadKind,
  staffMoney,
  staffVehicleCorrectionDiff,
} from '~/utils/portal-request-review-ui'

const props = defineProps<{
  payload: PortalInvoiceCorrectionPayload
  compact?: boolean
}>()

const kind = computed(() => staffCorrectionPayloadKind(props.payload))
const vehicleDiff = computed(() => {
  if (kind.value !== 'vehicle' || !('kind' in props.payload) || props.payload.kind !== 'vehicle') return []
  return staffVehicleCorrectionDiff(props.payload)
})
</script>

<template>
  <div class="staff-correction" :class="{ compact }">
    <template v-if="kind === 'line_item' && 'lineItemId' in payload">
      <div class="staff-correction-head">
        <span class="pill info">Line item</span>
        <span v-if="compact" class="sub">Current → Requested</span>
      </div>
      <div class="staff-correction-grid">
        <div class="staff-correction-col">
          <p class="staff-correction-label">Current</p>
          <p class="staff-correction-value">{{ payload.original.description }}</p>
          <p class="staff-correction-meta">
            Qty/hrs {{ payload.original.quantity }} · Rate {{ staffMoney(payload.original.unitPrice) }}
          </p>
        </div>
        <div class="staff-correction-arrow" aria-hidden="true">→</div>
        <div class="staff-correction-col staff-correction-col-after">
          <p class="staff-correction-label">Requested</p>
          <p class="staff-correction-value">{{ payload.proposed.description }}</p>
          <p class="staff-correction-meta">
            Qty/hrs {{ payload.proposed.quantity }} · Rate {{ staffMoney(payload.proposed.unitPrice) }}
          </p>
        </div>
      </div>
      <p v-if="payload.notes?.trim()" class="staff-correction-note">Customer note: {{ payload.notes.trim() }}</p>
    </template>

    <template v-else-if="kind === 'vehicle'">
      <div class="staff-correction-head">
        <span class="pill info">Invoice vehicle</span>
        <span v-if="compact" class="sub">Snapshot changes</span>
      </div>
      <div v-if="vehicleDiff.length" class="staff-field-diff">
        <div v-for="field in vehicleDiff" :key="field.label" class="staff-field-diff-row">
          <span class="staff-field-diff-label">{{ field.label }}</span>
          <span class="staff-field-diff-before">{{ field.before }}</span>
          <span class="staff-field-diff-arrow" aria-hidden="true">→</span>
          <span class="staff-field-diff-after">{{ field.after }}</span>
        </div>
      </div>
      <p v-else class="sub">No field changes detected in the structured payload.</p>
      <p v-if="'notes' in payload && payload.notes?.trim()" class="staff-correction-note">
        Customer note: {{ payload.notes.trim() }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.staff-correction {
  margin-top: 8px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.staff-correction.compact {
  padding: 10px;
}
.staff-correction-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.staff-correction-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}
.staff-correction.compact .staff-correction-grid {
  grid-template-columns: 1fr;
}
.staff-correction.compact .staff-correction-arrow {
  display: none;
}
.staff-correction-label {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}
.staff-correction-value {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.staff-correction-meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}
.staff-correction-col-after .staff-correction-value {
  color: #1d4ed8;
}
.staff-correction-arrow {
  padding-top: 22px;
  color: #94a3b8;
  font-weight: 700;
}
.staff-correction-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: #475569;
}
.staff-field-diff {
  display: grid;
  gap: 8px;
}
.staff-field-diff-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.staff-field-diff-label {
  font-weight: 700;
  color: #64748b;
}
.staff-field-diff-before {
  color: #475569;
}
.staff-field-diff-arrow {
  color: #94a3b8;
  font-weight: 700;
}
.staff-field-diff-after {
  color: #1d4ed8;
  font-weight: 600;
}
.sub {
  font-size: 12px;
  color: #64748b;
}
@media (max-width: 640px) {
  .staff-correction-grid,
  .staff-field-diff-row {
    grid-template-columns: 1fr;
  }
  .staff-correction-arrow,
  .staff-field-diff-arrow {
    display: none;
  }
}
</style>
