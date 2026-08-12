<script setup lang="ts">
import type { AccessDisplayGroup, AccessEventSort, AccessMapEvent } from '~/utils/access-gate-map'
import {
  ACCESS_DISPLAY_GROUP_COLORS,
  ACCESS_DISPLAY_GROUP_LABELS,
} from '#shared/access-event-display'
import {
  accessEventDisplayGroup,
  accessEventDisplayLabel,
  accessEventUserLabel,
  accessEventWhen,
  accessGateDayBounds,
  accessGateDayKey,
  countAccessDisplayGroups,
  formatAccessGateDayLabel,
  shiftAccessGateDayKey,
  shortFingerprint,
} from '~/utils/access-gate-map'
import type { AccessGateSettings } from '#shared/validators/access-gate'
import { DEFAULT_ACCESS_GATE_SETTINGS } from '#shared/validators/access-gate'

interface SettingsResponse {
  settings: AccessGateSettings
}

const { data, refresh, pending } = useClientFetch<SettingsResponse>('/api/admin/security/access-gate')

const form = reactive<AccessGateSettings>({
  ...DEFAULT_ACCESS_GATE_SETTINGS,
  bannedIps: [],
  allowedPolygon: [],
})

watch(() => data.value?.settings, (s) => {
  if (!s) return
  form.enabled = s.enabled
  form.blockMode = s.blockMode
  form.redirectUrl = ''
  form.bannedIps = [...s.bannedIps]
  form.allowedPolygon = [...s.allowedPolygon]
}, { immediate: true })

const events = ref<AccessMapEvent[]>([])
const eventFilter = ref<'all' | 'visit' | 'login'>('all')
const groupFilter = ref<'all' | AccessDisplayGroup>('all')
const sortBy = ref<AccessEventSort>('newest')
const searchQ = ref('')
const filtersOpen = ref(false)
const dayMode = ref<'day' | 'all'>('day')
const selectedDay = ref(accessGateDayKey())
const eventsLoading = ref(false)
const drawing = ref(false)
const newIp = ref('')
const busy = ref(false)
const message = ref('')
const error = ref('')

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadEvents() {
  eventsLoading.value = true
  try {
    const query: Record<string, string | number> = {
      limit: dayMode.value === 'all' ? 5000 : 2000,
      sort: sortBy.value,
    }
    if (eventFilter.value !== 'all') query.type = eventFilter.value
    if (groupFilter.value !== 'all') query.group = groupFilter.value
    if (searchQ.value.trim()) query.q = searchQ.value.trim()
    if (dayMode.value === 'day') {
      const bounds = accessGateDayBounds(selectedDay.value)
      if (bounds) {
        query.from = bounds.from
        query.to = bounds.to
      }
    }
    const res = await $fetch<{ items: AccessMapEvent[] }>('/api/admin/security/access-gate/events', { query })
    events.value = res.items
  }
  catch {
    events.value = []
  }
  finally {
    eventsLoading.value = false
  }
}

watch([eventFilter, groupFilter, sortBy, dayMode, selectedDay], () => { void loadEvents() })
watch(searchQ, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void loadEvents() }, 220)
})
onMounted(() => { void loadEvents() })

const groupCounts = computed(() => countAccessDisplayGroups(events.value))
const loginCount = computed(() => events.value.filter(e => e.eventType === 'login').length)
const visitCount = computed(() => events.value.filter(e => e.eventType === 'visit').length)
const mappedCount = computed(() => events.value.filter(e => e.latitude != null && e.longitude != null).length)
const tableRows = computed(() => events.value.slice(0, 100))

const dayLabel = computed(() => (
  dayMode.value === 'all' ? 'All days' : formatAccessGateDayLabel(selectedDay.value)
))

const filtersDirty = computed(() => (
  eventFilter.value !== 'all'
  || groupFilter.value !== 'all'
  || sortBy.value !== 'newest'
  || !!searchQ.value.trim()
))

function clearAdvancedFilters() {
  eventFilter.value = 'all'
  groupFilter.value = 'all'
  sortBy.value = 'newest'
  searchQ.value = ''
}

function prevDay() {
  dayMode.value = 'day'
  selectedDay.value = shiftAccessGateDayKey(selectedDay.value, -1)
}

function nextDay() {
  dayMode.value = 'day'
  selectedDay.value = shiftAccessGateDayKey(selectedDay.value, 1)
}

function goToday() {
  dayMode.value = 'day'
  selectedDay.value = accessGateDayKey()
}

function showAllDays() {
  dayMode.value = 'all'
}

function outcomeTone(ev: AccessMapEvent): string {
  const group = accessEventDisplayGroup(ev)
  if (group === 'access_granted') return 'ok'
  if (group === 'fail') return 'warn'
  if (group === 'geofence_blocked') return 'geo'
  return 'bad'
}


function onPolygonUpdate(points: { lat: number, lng: number }[]) {
  form.allowedPolygon = points
}

function clearPolygon() {
  form.allowedPolygon = []
}

function addBannedIp() {
  const ip = newIp.value.trim()
  if (!ip) return
  if (!form.bannedIps.includes(ip)) form.bannedIps.push(ip)
  newIp.value = ''
}

function removeBannedIp(ip: string) {
  form.bannedIps = form.bannedIps.filter(i => i !== ip)
}

function onBanFromMap(ip: string) {
  if (!form.bannedIps.includes(ip)) form.bannedIps.push(ip)
  message.value = `${ip} added to ban list — save to apply.`
}

async function save() {
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    await $fetch('/api/admin/security/access-gate', {
      method: 'PATCH',
      body: {
        enabled: form.enabled,
        blockMode: form.blockMode,
        redirectUrl: '',
        bannedIps: [...form.bannedIps],
        allowedPolygon: [...form.allowedPolygon],
      },
    })
    message.value = 'Saved'
    await refresh()
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card ag-card">
    <div class="chead">
      <h3>Access gate</h3>
      <div class="right">
        <span class="pill" :class="form.enabled ? 'warn' : 'ok'">{{ form.enabled ? 'On' : 'Off' }}</span>
      </div>
    </div>

    <div class="cbody ag-panel">
      <div v-if="pending" class="ag-loading">Loading…</div>

      <template v-else>
        <section class="ag-settings">
          <label class="ag-switch">
            <span>
              <b>Enabled</b>
              <small>Capture visits and enforce the mode below</small>
            </span>
            <span class="tgl"><input v-model="form.enabled" type="checkbox"><span class="tr" /></span>
          </label>

          <label class="fld ag-mode">
            <span>Mode</span>
            <select v-model="form.blockMode">
              <option value="off">Capture only</option>
              <option value="ip">IP ban</option>
              <option value="geo">Geofence</option>
              <option value="both">IP + geofence</option>
            </select>
          </label>
        </section>

        <section class="ag-map-section">
          <div class="ag-toolbar">
            <div class="ag-daynav" role="group" aria-label="Event day">
              <button type="button" class="btn sm" :disabled="dayMode === 'all'" aria-label="Previous day" @click="prevDay">‹</button>
              <div class="ag-daylabel">
                <strong>{{ dayLabel }}</strong>
                <small>
                  {{ visitCount }} visits · {{ loginCount }} logins ·
                  {{ groupCounts.access_granted }} granted ·
                  {{ groupCounts.fail }} fail ·
                  {{ groupCounts.geofence_blocked }} geofence ·
                  {{ groupCounts.blocked }} blocked
                </small>
              </div>
              <button type="button" class="btn sm" :disabled="dayMode === 'all'" aria-label="Next day" @click="nextDay">›</button>
              <button type="button" class="btn sm" @click="goToday">Today</button>
              <button
                type="button"
                class="btn sm"
                :class="{ primary: dayMode === 'all' }"
                @click="showAllDays"
              >
                Show all
              </button>
            </div>

            <div class="ag-maptools">
              <button
                type="button"
                class="btn sm"
                :class="{ primary: filtersOpen || filtersDirty }"
                @click="filtersOpen = !filtersOpen"
              >
                Filters
              </button>
              <button type="button" class="btn sm" :disabled="eventsLoading" @click="loadEvents">
                {{ eventsLoading ? '…' : 'Refresh' }}
              </button>
              <button type="button" class="btn sm" :class="{ primary: drawing }" @click="drawing = !drawing">
                {{ drawing ? 'Done' : 'Draw area' }}
              </button>
              <button type="button" class="btn sm" :disabled="!form.allowedPolygon.length" @click="clearPolygon">
                Clear area
              </button>
            </div>
          </div>

          <div v-if="filtersOpen" class="ag-filters">
            <label class="fld">
              Search
              <input
                v-model="searchQ"
                type="search"
                placeholder="User, email, IP, path, device…"
                aria-label="Search access events"
              >
            </label>
            <label class="fld">
              Connection type
              <select v-model="eventFilter" aria-label="Connection type">
                <option value="all">All types</option>
                <option value="login">Logins</option>
                <option value="visit">Visits</option>
              </select>
            </label>
            <label class="fld">
              Outcome
              <select v-model="groupFilter" aria-label="Outcome group">
                <option value="all">All outcomes</option>
                <option value="access_granted">Access granted</option>
                <option value="fail">Fail</option>
                <option value="geofence_blocked">Geofence blocked</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label class="fld">
              Sort
              <select v-model="sortBy" aria-label="Sort events">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="outcome">Outcome</option>
                <option value="type">Type</option>
                <option value="user">User</option>
                <option value="ip">IP</option>
              </select>
            </label>
            <div class="ag-filters-actions">
              <button type="button" class="btn sm" :disabled="!filtersDirty" @click="clearAdvancedFilters">
                Clear filters
              </button>
            </div>
          </div>

          <div class="ag-legend">
            <span>
              <i class="ag-sw" :style="{ background: ACCESS_DISPLAY_GROUP_COLORS.access_granted }" />
              {{ ACCESS_DISPLAY_GROUP_LABELS.access_granted }}
            </span>
            <span>
              <i class="ag-sw" :style="{ background: ACCESS_DISPLAY_GROUP_COLORS.fail }" />
              {{ ACCESS_DISPLAY_GROUP_LABELS.fail }}
            </span>
            <span>
              <i class="ag-sw" :style="{ background: ACCESS_DISPLAY_GROUP_COLORS.geofence_blocked }" />
              {{ ACCESS_DISPLAY_GROUP_LABELS.geofence_blocked }}
            </span>
            <span>
              <i class="ag-sw" :style="{ background: ACCESS_DISPLAY_GROUP_COLORS.blocked }" />
              {{ ACCESS_DISPLAY_GROUP_LABELS.blocked }}
            </span>
            <span v-if="form.allowedPolygon.length" class="ag-legend-muted">
              Fence: {{ form.allowedPolygon.length }} pts
            </span>
          </div>

          <ClientOnly>
            <AdminAccessGateMap
              :events="events"
              :polygon="form.allowedPolygon"
              :drawing="drawing"
              @update:polygon="onPolygonUpdate"
              @ban-ip="onBanFromMap"
            />
            <template #fallback>
              <div class="ag-map-fallback">Loading map…</div>
            </template>
          </ClientOnly>
        </section>

        <section class="ag-table-wrap">
          <div class="ag-section-head">
            <h4>Device capture</h4>
            <span class="ag-muted">{{ mappedCount }} mapped · showing {{ tableRows.length }} of {{ events.length }}</span>
          </div>
          <div class="ag-table-scroll">
            <table class="ag-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Outcome</th>
                  <th>User</th>
                  <th>IP</th>
                  <th>User-Agent</th>
                  <th>OS</th>
                  <th>Device</th>
                  <th>Screen</th>
                  <th>DPR</th>
                  <th>CPU</th>
                  <th>RAM</th>
                  <th>GPU</th>
                  <th>Canvas</th>
                  <th>WebGL</th>
                  <th>Audio</th>
                  <th>TZ</th>
                  <th>Lang</th>
                  <th>Touch</th>
                  <th>Device ID</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!events.length">
                  <td colspan="21" class="ag-table-empty">
                    {{ eventsLoading ? 'Loading…' : (dayMode === 'all' ? 'No events yet.' : 'No events for this day.') }}
                  </td>
                </tr>
                <tr v-for="ev in tableRows" :key="ev.id">
                  <td>{{ accessEventWhen(ev.createdAt) }}</td>
                  <td>{{ ev.eventType }}</td>
                  <td>
                    <span class="ag-outcome" :class="outcomeTone(ev)">
                      {{ accessEventDisplayLabel(ev) }}
                    </span>
                  </td>
                  <td class="ag-user" :title="accessEventUserLabel(ev)">
                    {{ accessEventUserLabel(ev) }}
                  </td>
                  <td class="mono">{{ ev.ipAddress || '—' }}</td>
                  <td class="ag-ua" :title="ev.userAgent || ''">{{ shortFingerprint(ev.userAgent, 28) }}</td>
                  <td>{{ ev.os || '—' }}</td>
                  <td>{{ ev.deviceType || '—' }}</td>
                  <td class="mono">{{ ev.screenResolution || '—' }}</td>
                  <td class="mono">{{ ev.devicePixelRatio ?? '—' }}</td>
                  <td class="mono">{{ ev.cpuCores ?? '—' }}</td>
                  <td class="mono">{{ ev.deviceMemoryGb != null ? `${ev.deviceMemoryGb} GB` : '—' }}</td>
                  <td class="ag-ua" :title="ev.gpuRenderer || ''">{{ shortFingerprint(ev.gpuRenderer, 18) }}</td>
                  <td class="mono" :title="ev.canvasFingerprint || ''">{{ shortFingerprint(ev.canvasFingerprint) }}</td>
                  <td class="mono" :title="ev.webglFingerprint || ''">{{ shortFingerprint(ev.webglFingerprint) }}</td>
                  <td class="mono" :title="ev.audioFingerprint || ''">{{ shortFingerprint(ev.audioFingerprint) }}</td>
                  <td>{{ ev.timezone || '—' }}</td>
                  <td>{{ ev.language || '—' }}</td>
                  <td class="mono">{{ ev.maxTouchPoints ?? '—' }}</td>
                  <td class="mono" :title="ev.deviceId || ''">{{ shortFingerprint(ev.deviceId, 12) }}</td>
                  <td class="ag-ua" :title="ev.path || ''">{{ shortFingerprint(ev.path, 24) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="ag-bans">
          <div class="ag-section-head">
            <h4>Banned IPs</h4>
            <span class="ag-muted">{{ form.bannedIps.length }} listed</span>
          </div>
          <div class="ag-ban-add">
            <input v-model="newIp" type="text" placeholder="203.0.113.10" @keyup.enter="addBannedIp">
            <button type="button" class="btn sm" @click="addBannedIp">Add</button>
          </div>
          <div class="ag-table-scroll ag-ban-table-scroll">
            <table class="ag-table ag-ban-table">
              <thead>
                <tr>
                  <th>IP address</th>
                  <th class="ag-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!form.bannedIps.length">
                  <td colspan="2" class="ag-table-empty">No banned IPs</td>
                </tr>
                <tr v-for="ip in form.bannedIps" :key="ip">
                  <td class="mono">{{ ip }}</td>
                  <td class="ag-col-actions">
                    <button type="button" class="btn sm danger" @click="removeBannedIp(ip)">Remove</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <p v-if="message" class="ag-ok">{{ message }}</p>
        <p v-if="error" class="ag-err">{{ error }}</p>

        <div class="ag-actions">
          <button type="button" class="btn primary" :disabled="busy" @click="save">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ag-panel { display: flex; flex-direction: column; gap: 18px; }
.ag-loading, .ag-map-fallback {
  display: grid; place-items: center; min-height: 120px; color: #64748b; font-size: 13px;
  border: 1px dashed #e2e8f0; border-radius: 12px; background: #f8fafc;
}
.ag-map-fallback { min-height: 420px; }

.ag-settings {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: linear-gradient(180deg, #fcfcfd 0%, #f8fafc 100%);
}
.ag-switch {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.ag-switch b { display: block; font-size: 13.5px; color: #0f172a; }
.ag-switch small { display: block; margin-top: 2px; font-size: 12px; color: #64748b; }
.ag-mode span { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 600; color: #475569; }

.ag-toolbar {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between;
}
.ag-daynav { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ag-daylabel {
  min-width: 160px; padding: 0 4px;
  display: flex; flex-direction: column; gap: 1px;
}
.ag-daylabel strong { font-size: 13.5px; color: #0f172a; }
.ag-daylabel small { font-size: 11.5px; color: #94a3b8; }
.ag-maptools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.ag-filters {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) repeat(3, minmax(120px, 1fr)) auto;
  gap: 10px;
  align-items: end;
  margin: 8px 0 4px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.ag-filters .fld { margin: 0; }
.ag-filters-actions { display: flex; align-items: end; padding-bottom: 2px; }
.ag-legend {
  display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: #475569; margin: 8px 0 10px;
}
.ag-legend span { display: inline-flex; align-items: center; gap: 5px; }
.ag-legend-muted { color: #94a3b8; }
.ag-sw { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.ag-outcome {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.ag-outcome.ok { background: #eef2ff; color: #3730a3; }
.ag-outcome.warn { background: #fef3c7; color: #92400e; }
.ag-outcome.geo { background: #ffedd5; color: #9a3412; }
.ag-outcome.bad { background: #fee2e2; color: #991b1b; }
.ag-user {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ag-section-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px;
}
.ag-section-head h4 { margin: 0; font-size: 13.5px; font-weight: 700; color: #0f172a; }
.ag-muted { font-size: 12px; color: #94a3b8; }

.ag-table-scroll {
  overflow: auto;
  max-height: 340px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.ag-ban-table-scroll { max-height: 220px; }
.ag-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
.ag-ban-table { width: 100%; }
.ag-table th, .ag-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  white-space: nowrap;
  vertical-align: top;
}
.ag-table th {
  position: sticky; top: 0; z-index: 1;
  background: #f8fafc; color: #475569; font-weight: 600;
}
.ag-table-empty { text-align: center; color: #94a3b8; padding: 18px !important; }
.ag-ua { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.ag-col-actions { width: 1%; text-align: right !important; }

.ag-ban-add { display: flex; gap: 8px; margin-bottom: 8px; }
.ag-ban-add input {
  flex: 1; min-width: 0; border: 1px solid #e2e8f0; border-radius: 9px;
  padding: 8px 12px; font-size: 14px; background: #fff;
}
.btn.danger {
  color: #b91c1c; border-color: #fecaca; background: #fef2f2;
}
.btn.danger:hover { background: #fee2e2; }

.ag-ok { margin: 0; color: #059669; font-size: 13px; }
.ag-err { margin: 0; color: #dc2626; font-size: 13px; }
.ag-actions { display: flex; }

@media (max-width: 820px) {
  .ag-settings { grid-template-columns: 1fr; }
  .ag-daylabel { min-width: 120px; }
  .ag-filters { grid-template-columns: 1fr 1fr; }
}
</style>
