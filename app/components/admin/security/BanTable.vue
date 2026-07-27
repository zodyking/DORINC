<script setup lang="ts">
import type { IpBanStatus } from '#shared/validators/security-access'
import type { SecurityBan } from '~/utils/security-center'
import {
  banSourceLabel,
  banStatusPillClass,
  formatRelative,
  formatWhen,
  shortUserAgent,
} from '~/utils/security-center'

const props = defineProps<{
  bans: SecurityBan[]
  total: number
  loading: boolean
  /** Pre-filled address when a ban was started from the map or threat list. */
  prefillIp: string
}>()

const emit = defineEmits<{
  'create': [payload: { ipRule: string, reason: string, notes: string, expiresAt: string | null }]
  'update': [payload: { id: string, status?: IpBanStatus, liftReason?: string }]
  'delete': [id: string]
  'refresh': []
  'update:status': [status: IpBanStatus | 'all']
  'update:search': [search: string]
  'clear-prefill': []
}>()

const statusFilter = ref<IpBanStatus | 'all'>('active')
const search = ref('')
const expandedId = ref<string | null>(null)

const form = reactive({
  ipRule: '',
  reason: '',
  notes: '',
  /** Hours until the ban lifts itself; 0 means permanent. */
  durationHours: 0,
})

watch(() => props.prefillIp, (ip) => {
  if (!ip) return
  form.ipRule = ip
  expandedId.value = null
}, { immediate: true })

watch(statusFilter, value => emit('update:status', value))

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => emit('update:search', value.trim()), 300)
})

const canSubmit = computed(() => form.ipRule.trim().length > 1)

function submit() {
  if (!canSubmit.value) return
  const expiresAt = form.durationHours > 0
    ? new Date(Date.now() + form.durationHours * 3600_000).toISOString()
    : null
  emit('create', {
    ipRule: form.ipRule.trim(),
    reason: form.reason.trim(),
    notes: form.notes.trim(),
    expiresAt,
  })
  form.ipRule = ''
  form.reason = ''
  form.notes = ''
  form.durationHours = 0
  emit('clear-prefill')
}

function toggleRow(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function expiryLabel(ban: SecurityBan): string {
  if (!ban.expiresAt) return 'Permanent'
  const at = new Date(ban.expiresAt).getTime()
  return at <= Date.now() ? `Expired ${formatRelative(ban.expiresAt)}` : `Until ${formatWhen(ban.expiresAt)}`
}
</script>

<template>
  <div class="card">
    <div class="chead">
      <h3>IP bans</h3>
      <div class="right">
        <span class="pill" :class="total ? 'over' : 'gray'">{{ total }} total</span>
        <button type="button" class="btn sm" :disabled="loading" @click="emit('refresh')">
          {{ loading ? '…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div class="cbody sb-form">
      <div class="sb-grid">
        <label class="fld">
          IP address or CIDR range
          <input
            v-model="form.ipRule"
            type="text"
            placeholder="203.0.113.10 or 203.0.113.0/24"
            @keyup.enter="submit"
          >
          <span class="help">A range bans every address inside it.</span>
        </label>
        <label class="fld">
          Reason
          <input v-model="form.reason" type="text" placeholder="Credential stuffing from this host">
        </label>
        <label class="fld">
          Duration
          <select v-model.number="form.durationHours">
            <option :value="0">Permanent</option>
            <option :value="1">1 hour</option>
            <option :value="24">24 hours</option>
            <option :value="168">7 days</option>
            <option :value="720">30 days</option>
          </select>
        </label>
      </div>
      <label class="fld">
        Notes
        <textarea v-model="form.notes" rows="2" placeholder="Anything a future admin should know before lifting this." />
      </label>
      <div class="sb-actions">
        <button type="button" class="btn primary" :disabled="!canSubmit || loading" @click="submit">
          Add ban
        </button>
        <div class="sb-filters">
          <input v-model="search" type="search" placeholder="Search IP, reason, location" aria-label="Search bans">
          <select v-model="statusFilter" aria-label="Filter by status">
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="lifted">Lifted</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="bans.length" class="tscroll">
      <table class="tbl">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Status</th>
            <th>Reason</th>
            <th>Location</th>
            <th class="num">Hits</th>
            <th>Last hit</th>
            <th>Added</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="ban in bans" :key="ban.id">
            <tr class="click" @click="toggleRow(ban.id)">
              <td>
                <span class="lead mono">{{ ban.ipRule }}</span>
                <span class="sub">{{ ban.kind === 'range' ? `IPv${ban.family} range` : `IPv${ban.family} address` }}</span>
              </td>
              <td>
                <span class="pill" :class="banStatusPillClass(ban.status)">{{ ban.status }}</span>
                <span class="sub">{{ expiryLabel(ban) }}</span>
              </td>
              <td>
                <span>{{ ban.reason || '—' }}</span>
                <span class="sub">{{ banSourceLabel(ban.source) }}</span>
              </td>
              <td>
                <span>{{ ban.lastLocationLabel || '—' }}</span>
                <span v-if="ban.lastCountry" class="sub">{{ ban.lastCountry }}</span>
              </td>
              <td class="num">{{ ban.hitCount }}</td>
              <td><span class="mono sb-time">{{ formatRelative(ban.lastHitAt) }}</span></td>
              <td>
                <span class="mono sb-time">{{ formatRelative(ban.createdAt) }}</span>
                <span v-if="ban.createdByName" class="sub">{{ ban.createdByName }}</span>
              </td>
              <td class="sb-rowactions" @click.stop>
                <button
                  v-if="ban.status === 'active'"
                  type="button"
                  class="btn sm"
                  @click="emit('update', { id: ban.id, status: 'lifted' })"
                >
                  Lift
                </button>
                <button
                  v-else
                  type="button"
                  class="btn sm"
                  @click="emit('update', { id: ban.id, status: 'active' })"
                >
                  Re-apply
                </button>
                <button type="button" class="btn sm danger" @click="emit('delete', ban.id)">
                  Delete
                </button>
              </td>
            </tr>
            <tr v-if="expandedId === ban.id" class="sb-detailrow">
              <td colspan="8">
                <dl class="sb-detail">
                  <dt>Notes</dt>
                  <dd>{{ ban.notes || '—' }}</dd>
                  <dt>Usernames seen</dt>
                  <dd>
                    <span v-if="!ban.lastIdentifiers.length">—</span>
                    <span v-for="identifier in ban.lastIdentifiers" v-else :key="identifier" class="sb-chip mono">
                      {{ identifier }}
                    </span>
                  </dd>
                  <dt>Attempts before ban</dt>
                  <dd>{{ ban.triggerAttempts || '—' }}</dd>
                  <dt>Last device</dt>
                  <dd>{{ shortUserAgent(ban.lastUserAgent) }}</dd>
                  <dt>Created</dt>
                  <dd>{{ formatWhen(ban.createdAt) }}<span v-if="ban.createdByEmail"> · {{ ban.createdByEmail }}</span></dd>
                  <dt v-if="ban.liftedAt">
                    Lifted
                  </dt>
                  <dd v-if="ban.liftedAt">
                    {{ formatWhen(ban.liftedAt) }}
                    <span v-if="ban.liftedByName"> by {{ ban.liftedByName }}</span>
                    <span v-if="ban.liftReason"> — {{ ban.liftReason }}</span>
                  </dd>
                </dl>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <p v-else class="cbody sb-empty">
      No bans match this filter. Add one above, or ban an address straight from the map or the repeat-attempt list.
    </p>
  </div>
</template>

<style scoped>
.sb-form { display: flex; flex-direction: column; gap: 4px; }
.sb-grid { display: grid; grid-template-columns: 1.4fr 1.4fr 0.8fr; gap: 12px; }
.sb-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.sb-filters { display: flex; gap: 8px; }
.sb-filters input, .sb-filters select {
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 7px 10px;
  font-size: 13px;
  background: #fff;
}
.sb-filters input { min-width: 200px; }
.sb-time { font-size: 12px; }
.sb-rowactions { display: flex; gap: 6px; white-space: nowrap; }
.sb-detailrow td { background: #fafbfe; }
.sb-detail { display: grid; grid-template-columns: 160px 1fr; gap: 6px 14px; margin: 0; }
.sb-detail dt { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }
.sb-detail dd { margin: 0; font-size: 13px; color: #334155; }
.sb-chip {
  display: inline-block;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 11.5px;
  margin: 0 4px 4px 0;
}
.sb-empty { font-size: 13px; color: #64748b; margin: 0; }
@media (max-width: 900px) {
  .sb-grid { grid-template-columns: 1fr; }
  .sb-filters input { min-width: 0; flex: 1; }
  .sb-detail { grid-template-columns: 1fr; }
}
</style>
