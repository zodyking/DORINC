<script setup lang="ts">
import {
  PERMISSION_COLUMN_LABELS,
  cellsForColumn,
  hasColumn,
  canViewPage,
  resolvePermissionStatus,
  staffPermissionAreas,
  type OverrideState,
  type PermissionArea,
  type PermissionColumn,
  type PermissionStatus,
} from '#shared/permissions/display'

const props = withDefaults(defineProps<{
  roleGrants?: string[]
  overrideStates?: Record<string, OverrideState>
  selectedKeys?: Set<string>
  mode?: 'readonly' | 'editable' | 'checkbox'
  areas?: PermissionArea[]
  showNavHint?: boolean
  compact?: boolean
}>(), {
  roleGrants: () => [],
  overrideStates: () => ({}),
  selectedKeys: () => new Set<string>(),
  mode: 'readonly',
  areas: undefined,
  showNavHint: true,
  compact: false,
})

const emit = defineEmits<{
  cycle: [key: string]
  toggle: [key: string]
}>()

const columns: PermissionColumn[] = ['view', 'edit', 'delete', 'other']

const roleGrantSet = computed(() => new Set(props.roleGrants))

const displayAreas = computed(() => props.areas ?? staffPermissionAreas())

function statusFor(cell: { key: string, label: string }): PermissionStatus {
  const locked = cell.key === 'system.admin.all'
  return resolvePermissionStatus(
    cell.key as PermissionStatus['key'],
    cell.label,
    roleGrantSet.value,
    props.overrideStates,
    locked,
  )
}

function checkboxChecked(key: string): boolean {
  return props.selectedKeys.has(key)
}

function checkboxDisabled(key: string): boolean {
  return key === 'system.admin.all'
}

function handleCellClick(status: PermissionStatus) {
  if (props.mode === 'editable' && !status.locked) {
    emit('cycle', status.key)
  }
  else if (props.mode === 'checkbox' && !checkboxDisabled(status.key)) {
    emit('toggle', status.key)
  }
}

function columnHasContent(area: PermissionArea, column: PermissionColumn): boolean {
  return hasColumn(area, column)
}

function pageVisible(area: PermissionArea): boolean {
  if (props.mode === 'checkbox') {
    if (!area.navKeys.length) {
      return cellsForColumn(area, 'view').some(c => props.selectedKeys.has(c.key))
    }
    return area.navKeys.some(key => props.selectedKeys.has(key))
  }
  return canViewPage(area, roleGrantSet.value, props.overrideStates)
}

function overrideLabel(state: OverrideState): string {
  if (state === 'allow') return 'Override: Allow'
  if (state === 'deny') return 'Override: Deny'
  return 'From role'
}

function chipGranted(cell: { key: string, label: string }): boolean {
  if (props.mode === 'checkbox') return checkboxChecked(cell.key)
  return statusFor(cell).granted
}

function statusTitle(status: PermissionStatus): string {
  const base = status.granted ? 'Granted' : 'Denied'
  if (props.mode === 'editable') {
    if (status.locked) return `${base} — cannot override`
    const next = status.override === 'inherit' ? 'Allow' : status.override === 'allow' ? 'Deny' : 'Inherit'
    return `${base} (${overrideLabel(status.override)}). Click to set: ${next}`
  }
  if (props.mode === 'checkbox') {
    return checkboxChecked(status.key) ? 'Granted — click to remove' : 'Not granted — click to add'
  }
  if (status.override !== 'inherit') return `${base} (${overrideLabel(status.override)})`
  if (status.fromRole) return `${base} (from role)`
  return base
}
</script>

<template>
  <div class="perm-table-wrap" :class="{ compact }">
    <p v-if="showNavHint && mode !== 'checkbox'" class="perm-table-hint">
      <strong>View page</strong> is the first gate — it controls whether a page appears in the side menu.
      Edit and deletion permissions only apply when the user can reach that page.
    </p>
    <p v-else-if="showNavHint && mode === 'checkbox'" class="perm-table-hint">
      Grant <strong>View page</strong> first so the page appears in navigation. Then add edit or deletion permissions as needed.
    </p>

    <div class="tscroll">
      <table class="tbl perm-table">
        <thead>
          <tr>
            <th>Page / area</th>
            <th v-for="col in columns" :key="col">{{ PERMISSION_COLUMN_LABELS[col] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="area in displayAreas"
            :key="area.id"
            :class="{ 'page-hidden': !pageVisible(area) && mode === 'readonly' }"
          >
            <td class="area-cell">
              <span class="lead">{{ area.label }}</span>
              <span v-if="area.description && !compact" class="sub">{{ area.description }}</span>
              <span
                v-if="area.navKeys.length && mode === 'readonly'"
                class="nav-badge"
                :class="pageVisible(area) ? 'visible' : 'hidden'"
              >
                {{ pageVisible(area) ? 'In menu' : 'Hidden' }}
              </span>
            </td>
            <td
              v-for="col in columns"
              :key="col"
              class="perm-col"
              :class="{ empty: !columnHasContent(area, col) }"
            >
              <template v-if="columnHasContent(area, col)">
                <button
                  v-for="cell in cellsForColumn(area, col)"
                  :key="cell.key"
                  type="button"
                  class="perm-chip"
                  :class="[
                    chipGranted(cell) ? 'granted' : 'denied',
                    statusFor(cell).override !== 'inherit' && mode !== 'checkbox' ? `ov-${statusFor(cell).override}` : '',
                    mode === 'editable' && !statusFor(cell).locked ? 'clickable' : '',
                    mode === 'checkbox' && !checkboxDisabled(cell.key) ? 'clickable' : '',
                    mode === 'checkbox' && checkboxChecked(cell.key) ? 'checked' : '',
                    statusFor(cell).locked ? 'locked' : '',
                  ]"
                  :disabled="(statusFor(cell).locked && mode === 'editable') || (checkboxDisabled(cell.key) && mode === 'checkbox')"
                  :title="statusTitle(statusFor(cell))"
                  @click="handleCellClick(statusFor(cell))"
                >
                  <span class="chip-label">{{ cell.label }}</span>
                  <span v-if="mode === 'checkbox'" class="chip-check">
                    {{ checkboxChecked(cell.key) ? '✓' : '' }}
                  </span>
                  <span v-else class="chip-status">
                    <template v-if="mode !== 'checkbox' && statusFor(cell).override === 'allow'">+</template>
                    <template v-else-if="mode !== 'checkbox' && statusFor(cell).override === 'deny'">−</template>
                    <template v-else>{{ chipGranted(cell) ? '✓' : '✗' }}</template>
                  </span>
                </button>
              </template>
              <span v-else class="perm-na">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="mode === 'editable'" class="perm-table-legend">
      Click a permission to cycle: <span class="leg inherit">Inherit</span>
      → <span class="leg allow">Allow</span> → <span class="leg deny">Deny</span>
    </p>
  </div>
</template>

<style scoped>
.perm-table-wrap {
  --perm-granted-bg: #ecfdf5;
  --perm-granted-fg: #059669;
  --perm-denied-bg: #fef2f2;
  --perm-denied-fg: #dc2626;
  --perm-inherit-border: #e2e8f0;
}

.perm-table-hint {
  margin: 0 0 12px;
  padding: 10px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
}

.perm-table-hint strong {
  color: #334155;
}

.perm-table {
  min-width: 640px;
}

.perm-table th {
  white-space: nowrap;
}

.perm-table th:not(:first-child) {
  text-align: center;
  width: 120px;
}

.area-cell {
  min-width: 160px;
}

.area-cell .lead {
  font-weight: 600;
  color: #0f172a;
}

.nav-badge {
  display: inline-block;
  margin-top: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.nav-badge.visible {
  background: #ecfdf5;
  color: #059669;
}

.nav-badge.hidden {
  background: #f1f5f9;
  color: #94a3b8;
}

.perm-col {
  text-align: center;
  vertical-align: top;
}

.perm-col.empty {
  color: #cbd5e1;
}

.perm-na {
  color: #cbd5e1;
  font-size: 13px;
}

.perm-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  min-width: 100px;
  margin: 3px 0;
  padding: 5px 8px;
  border: 1px solid var(--perm-inherit-border);
  border-radius: 6px;
  background: #fff;
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  cursor: default;
  transition: background 0.12s, border-color 0.12s;
}

.perm-chip.clickable {
  cursor: pointer;
}

.perm-chip.clickable:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.perm-chip.granted {
  background: var(--perm-granted-bg);
  border-color: #a7f3d0;
  color: #065f46;
}

.perm-chip.denied {
  background: var(--perm-denied-bg);
  border-color: #fecaca;
  color: #991b1b;
}

.perm-chip.ov-allow {
  box-shadow: inset 0 0 0 1px #3b82f6;
}

.perm-chip.ov-deny {
  box-shadow: inset 0 0 0 1px #ef4444;
}

.perm-chip.checked {
  background: var(--perm-granted-bg);
  border-color: #059669;
}

.perm-chip.locked {
  opacity: 0.55;
  cursor: not-allowed;
}

.chip-label {
  flex: 1;
  min-width: 0;
  font-weight: 500;
}

.chip-status,
.chip-check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}

.chip-status {
  background: rgba(0, 0, 0, 0.06);
}

.perm-chip.granted .chip-status {
  background: rgba(5, 150, 105, 0.15);
  color: #059669;
}

.perm-chip.denied .chip-status {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
}

.perm-chip.ov-allow .chip-status {
  background: #3b82f6;
  color: #fff;
}

.perm-chip.ov-deny .chip-status {
  background: #ef4444;
  color: #fff;
}

.page-hidden {
  opacity: 0.65;
}

.perm-table-legend {
  margin: 10px 0 0;
  font-size: 12px;
  color: #64748b;
}

.leg {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 11px;
}

.leg.inherit {
  background: #f1f5f9;
  color: #64748b;
}

.leg.allow {
  background: #dbeafe;
  color: #2563eb;
}

.leg.deny {
  background: #fee2e2;
  color: #dc2626;
}

.compact .perm-table-hint {
  font-size: 12px;
  padding: 8px 12px;
}

.compact .area-cell .sub {
  display: none;
}

@media (max-width: 720px) {
  .perm-table {
    min-width: 520px;
  }

  .perm-table th:not(:first-child) {
    width: 96px;
    font-size: 10px;
  }

  .perm-chip {
    min-width: 84px;
    font-size: 11px;
    padding: 4px 6px;
  }
}
</style>
