<script setup lang="ts">
import type { SecurityZoneKind } from '#shared/validators/security-access'
import type { SecurityZone } from '~/utils/security-center'
import { formatRelative } from '~/utils/security-center'

defineProps<{
  zones: SecurityZone[]
  loading: boolean
  editingZoneId: string | null
  /** True once the admin has traced a shape that is not yet saved. */
  hasPendingTrace: boolean
}>()

const emit = defineEmits<{
  'save-pending': [payload: { name: string, kind: SecurityZoneKind, description: string }]
  'discard-pending': []
  'toggle': [payload: { id: string, enabled: boolean }]
  'redraw': [id: string]
  'delete': [id: string]
  'refresh': []
}>()

const draft = reactive({
  name: '',
  kind: 'allow' as SecurityZoneKind,
  description: '',
})

function savePending() {
  const name = draft.name.trim() || (draft.kind === 'allow' ? 'Allowed area' : 'Blocked area')
  emit('save-pending', { name, kind: draft.kind, description: draft.description.trim() })
  draft.name = ''
  draft.description = ''
}
</script>

<template>
  <div class="card">
    <div class="chead">
      <h3>Geofence zones</h3>
      <div class="right">
        <span class="pill" :class="zones.some(z => z.enabled) ? 'info' : 'gray'">
          {{ zones.filter(z => z.enabled).length }} active
        </span>
        <button type="button" class="btn sm" :disabled="loading" @click="emit('refresh')">
          {{ loading ? '…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="hasPendingTrace" class="cbody sz-pending">
      <p class="sz-pending__title">
        Shape traced — name it to save.
      </p>
      <div class="sz-grid">
        <label class="fld">
          Zone name
          <input v-model="draft.name" type="text" placeholder="Main office">
        </label>
        <label class="fld">
          Type
          <select v-model="draft.kind">
            <option value="allow">Allowed area — access permitted inside</option>
            <option value="block">Blocked area — access denied inside</option>
          </select>
        </label>
      </div>
      <label class="fld">
        Description
        <input v-model="draft.description" type="text" placeholder="Optional note about this area">
      </label>
      <div class="sz-actions">
        <button type="button" class="btn primary" @click="savePending">
          {{ editingZoneId ? 'Replace zone shape' : 'Save zone' }}
        </button>
        <button type="button" class="btn" @click="emit('discard-pending')">
          Discard
        </button>
      </div>
    </div>

    <div v-if="zones.length" class="tscroll">
      <table class="tbl">
        <thead>
          <tr>
            <th>Zone</th>
            <th>Type</th>
            <th>Status</th>
            <th class="num">Points</th>
            <th class="num">Matches</th>
            <th>Last match</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="zone in zones" :key="zone.id" :class="{ 'sz-editing': zone.id === editingZoneId }">
            <td>
              <span class="lead">{{ zone.name }}</span>
              <span v-if="zone.description" class="sub">{{ zone.description }}</span>
            </td>
            <td>
              <span class="pill" :class="zone.kind === 'block' ? 'over' : 'info'">
                {{ zone.kind === 'block' ? 'Blocked' : 'Allowed' }}
              </span>
            </td>
            <td>
              <span class="pill" :class="zone.enabled ? 'ok' : 'gray'">{{ zone.enabled ? 'On' : 'Off' }}</span>
            </td>
            <td class="num">{{ zone.pointCount }}</td>
            <td class="num">{{ zone.hitCount }}</td>
            <td><span class="mono sz-time">{{ formatRelative(zone.lastHitAt) }}</span></td>
            <td class="sz-rowactions">
              <button type="button" class="btn sm" @click="emit('toggle', { id: zone.id, enabled: !zone.enabled })">
                {{ zone.enabled ? 'Disable' : 'Enable' }}
              </button>
              <button type="button" class="btn sm" @click="emit('redraw', zone.id)">
                {{ zone.id === editingZoneId ? 'Cancel redraw' : 'Redraw' }}
              </button>
              <button type="button" class="btn sm danger" @click="emit('delete', zone.id)">
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="cbody sz-empty">
      No zones yet. Turn on <b>Draw zone</b> above the map and trace an area — with no zones defined, the
      geofence check always passes.
    </p>
  </div>
</template>

<style scoped>
.sz-pending { background: #eef2ff; border-bottom: 1px solid #e0e7ff; }
.sz-pending__title { margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #4338ca; }
.sz-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; }
.sz-actions { display: flex; gap: 8px; }
.sz-time { font-size: 12px; }
.sz-rowactions { display: flex; gap: 6px; white-space: nowrap; }
.sz-editing td { background: #eef2ff; }
.sz-empty { font-size: 13px; color: #64748b; margin: 0; }
@media (max-width: 720px) {
  .sz-grid { grid-template-columns: 1fr; }
}
</style>
