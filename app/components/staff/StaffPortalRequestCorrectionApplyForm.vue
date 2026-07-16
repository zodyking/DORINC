<script setup lang="ts">
import type { PortalInvoiceCorrectionPayload } from '#shared/portal-invoice-correction'
import {
  staffBuildLineItemCorrectionApply,
  staffBuildVehicleCorrectionApply,
  staffCorrectionApplySummary,
  staffCorrectionPayloadKind,
  staffLineItemApplyFields,
  staffValidateCorrectionApplyFields,
  staffVehicleApplyFields,
  type StaffCorrectionApplyField,
} from '~/utils/portal-request-review-ui'

const props = defineProps<{
  payload: PortalInvoiceCorrectionPayload
}>()

const fields = ref<StaffCorrectionApplyField[]>([])

watch(
  () => props.payload,
  (payload) => {
    const kind = staffCorrectionPayloadKind(payload)
    if (kind === 'line_item' && 'lineItemId' in payload) {
      fields.value = staffLineItemApplyFields(payload)
    }
    else if (kind === 'vehicle' && 'kind' in payload && payload.kind === 'vehicle') {
      fields.value = staffVehicleApplyFields(payload)
    }
    else {
      fields.value = []
    }
  },
  { immediate: true },
)

const summary = computed(() => staffCorrectionApplySummary(fields.value))

function useOriginal(field: StaffCorrectionApplyField) {
  field.apply = field.key === 'unitPrice'
    ? field.original.replace(/^\$/, '')
    : field.original
}

function useProposed(field: StaffCorrectionApplyField) {
  field.apply = field.key === 'unitPrice'
    ? field.proposed.replace(/^\$/, '')
    : field.proposed
}

function applyState(field: StaffCorrectionApplyField): 'kept' | 'accepted' | 'custom' {
  const apply = field.key === 'unitPrice' ? field.apply.replace(/^\$/, '') : field.apply.trim()
  const original = field.key === 'unitPrice' ? field.original.replace(/^\$/, '') : field.original
  const proposed = field.key === 'unitPrice' ? field.proposed.replace(/^\$/, '') : field.proposed
  if (apply === original) return 'kept'
  if (apply === proposed) return 'accepted'
  return 'custom'
}

function validate(): string | null {
  return staffValidateCorrectionApplyFields(fields.value)
}

function buildApplyPayload() {
  const kind = staffCorrectionPayloadKind(props.payload)
  if (kind === 'line_item') return staffBuildLineItemCorrectionApply(fields.value)
  if (kind === 'vehicle' && 'kind' in props.payload && props.payload.kind === 'vehicle') {
    return staffBuildVehicleCorrectionApply(props.payload, fields.value)
  }
  return null
}

defineExpose({ validate, buildApplyPayload })
</script>

<template>
  <div class="staff-apply-form">
    <div class="staff-apply-head">
      <div>
        <h4>Choose what to apply</h4>
        <p class="sub">Per field: keep the current invoice value, accept the customer request, or enter your own value.</p>
      </div>
      <span class="pill gray">{{ summary.label }}</span>
    </div>

    <div class="staff-apply-table-wrap">
      <table class="staff-apply-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Current</th>
            <th>Requested</th>
            <th>Apply to revision</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="field in fields"
            :key="field.key"
            :class="{ changed: field.changed, custom: applyState(field) === 'custom' }"
          >
            <td class="field-label">
              {{ field.label }}
              <span v-if="field.changed" class="pill warn sm">Changed</span>
            </td>
            <td class="field-read">{{ field.original || '—' }}</td>
            <td class="field-read requested">{{ field.proposed || '—' }}</td>
            <td class="field-edit">
              <input
                v-model="field.apply"
                class="apply-input"
                :type="field.inputType === 'number' || field.inputType === 'money' ? 'text' : 'text'"
                :inputmode="field.inputType === 'number' || field.inputType === 'money' ? 'decimal' : 'text'"
              >
              <div class="apply-actions">
                <button type="button" class="btn xs" :class="{ on: applyState(field) === 'kept' }" @click="useOriginal(field)">
                  Keep current
                </button>
                <button type="button" class="btn xs" :class="{ on: applyState(field) === 'accepted' }" @click="useProposed(field)">
                  Accept request
                </button>
              </div>
              <p v-if="applyState(field) === 'custom'" class="apply-custom-note">Custom value</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="'notes' in payload && payload.notes?.trim()" class="staff-correction-note">
      Customer note: {{ payload.notes.trim() }}
    </p>
  </div>
</template>

<style scoped>
.staff-apply-form {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: #f8fbff;
}
.staff-apply-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.staff-apply-head h4 {
  margin: 0 0 4px;
  font-size: 14px;
}
.sub {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}
.staff-apply-table-wrap {
  overflow-x: auto;
}
.staff-apply-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.staff-apply-table th,
.staff-apply-table td {
  padding: 10px 8px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
  text-align: left;
}
.staff-apply-table th {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.field-label {
  min-width: 110px;
  font-weight: 700;
  color: #334155;
}
.field-read {
  color: #475569;
  min-width: 120px;
}
.field-read.requested {
  color: #1d4ed8;
  font-weight: 600;
}
.field-edit {
  min-width: 220px;
}
.apply-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13px;
  background: #fff;
}
.apply-input:focus {
  outline: 2px solid #93c5fd;
  border-color: #60a5fa;
}
.apply-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.btn.xs {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
}
.btn.xs.on {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
}
.apply-custom-note {
  margin: 6px 0 0;
  font-size: 11px;
  color: #7c3aed;
  font-weight: 600;
}
tr.changed td {
  background: rgba(255, 251, 235, 0.45);
}
tr.custom td.field-edit {
  background: rgba(237, 233, 254, 0.35);
}
.pill.sm {
  font-size: 10px;
  padding: 1px 6px;
  margin-left: 6px;
}
.staff-correction-note {
  margin: 12px 0 0;
  font-size: 12px;
  color: #475569;
}
</style>
