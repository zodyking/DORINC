<script setup lang="ts">
import type { AccessMapEvent } from '~/utils/access-gate-map'
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
  form.redirectUrl = s.redirectUrl
  form.bannedIps = [...s.bannedIps]
  form.allowedPolygon = [...s.allowedPolygon]
}, { immediate: true })

const events = ref<AccessMapEvent[]>([])
const eventFilter = ref<'all' | 'visit' | 'login'>('all')
const eventsLoading = ref(false)
const drawing = ref(false)
const newIp = ref('')
const busy = ref(false)
const message = ref('')
const error = ref('')

async function loadEvents() {
  eventsLoading.value = true
  try {
    const query = eventFilter.value === 'all' ? { limit: 2000 } : { type: eventFilter.value, limit: 2000 }
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

watch(eventFilter, () => { void loadEvents() })
onMounted(() => { void loadEvents() })

const loginCount = computed(() => events.value.filter(e => e.eventType === 'login').length)
const visitCount = computed(() => events.value.filter(e => e.eventType === 'visit').length)
const mappedCount = computed(() => events.value.filter(e => e.latitude != null && e.longitude != null).length)

function onPolygonUpdate(points: { lat: number, lng: number }[]) {
  form.allowedPolygon = points
}

function clearPolygon() {
  form.allowedPolygon = []
}

function undoPolygonPoint() {
  form.allowedPolygon = form.allowedPolygon.slice(0, -1)
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
  message.value = `Added ${ip} to the ban list — remember to save.`
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
        redirectUrl: form.redirectUrl,
        bannedIps: [...form.bannedIps],
        allowedPolygon: [...form.allowedPolygon],
      },
    })
    message.value = 'Access gate settings saved'
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
  <div class="card">
    <div class="chead">
      <h3>Access gate &amp; visit map</h3>
      <div class="right">
        <span class="pill" :class="form.enabled ? 'warn' : 'ok'">{{ form.enabled ? 'Enabled' : 'Off' }}</span>
      </div>
    </div>
    <div class="cbody ag-panel">
      <p class="ag-intro">
        Capture every site visit and login on a map. When enabled you can ban IP addresses and draw an
        allowed area — visitors and logins from banned IPs or outside the drawn area are redirected to your
        chosen link. Super Admins are always exempt so you can never lock yourself out. Off by default.
      </p>

      <div v-if="pending" class="ag-loading">Loading settings…</div>

      <template v-else>
        <div class="tglrow ag-toggle">
          <div>
            <div class="ag-label">Enable access gate</div>
            <div class="ag-desc">Turns on visit/login capture. Enforcement still requires a block mode below.</div>
          </div>
          <span class="tgl"><input v-model="form.enabled" type="checkbox"><span class="tr" /></span>
        </div>

        <div class="ag-grid">
          <label class="fld">
            Enforcement mode
            <select v-model="form.blockMode">
              <option value="off">Off — capture only, never block</option>
              <option value="ip">IP ban only</option>
              <option value="geo">Geofence only</option>
              <option value="both">IP ban + geofence</option>
            </select>
          </label>
          <label class="fld">
            Redirect blocked visitors to
            <input v-model="form.redirectUrl" type="url" placeholder="https://example.com/denied">
          </label>
        </div>

        <div class="ag-maphead">
          <div class="ag-legend">
            <span><i class="ag-sw" style="background:#4f46e5" /> Login</span>
            <span><i class="ag-sw" style="background:#f59e0b" /> Failed login</span>
            <span><i class="ag-sw" style="background:#0ea5e9" /> Visit</span>
            <span><i class="ag-sw" style="background:#dc2626" /> Blocked</span>
          </div>
          <div class="ag-maptools">
            <select v-model="eventFilter" class="ag-filter">
              <option value="all">All events</option>
              <option value="login">Logins</option>
              <option value="visit">Visits</option>
            </select>
            <button type="button" class="btn sm" :disabled="eventsLoading" @click="loadEvents">
              {{ eventsLoading ? '…' : 'Refresh' }}
            </button>
            <button
              type="button"
              class="btn sm"
              :class="{ primary: drawing }"
              @click="drawing = !drawing"
            >
              {{ drawing ? 'Done drawing' : 'Draw area' }}
            </button>
            <button type="button" class="btn sm" :disabled="!form.allowedPolygon.length" @click="undoPolygonPoint">Undo point</button>
            <button type="button" class="btn sm" :disabled="!form.allowedPolygon.length" @click="clearPolygon">Clear area</button>
          </div>
        </div>

        <p v-if="drawing" class="ag-hint">Click on the map to add points to the allowed area ({{ form.allowedPolygon.length }} point{{ form.allowedPolygon.length === 1 ? '' : 's' }}). Click the markers to ban an IP.</p>

        <ClientOnly>
          <AccessGateMap
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

        <div class="ag-stats">
          {{ visitCount }} visits · {{ loginCount }} logins · {{ mappedCount }} mapped
        </div>

        <div class="ag-bans">
          <div class="ag-label">Banned IP addresses</div>
          <div class="ag-ban-add">
            <input v-model="newIp" type="text" placeholder="e.g. 203.0.113.10" @keyup.enter="addBannedIp">
            <button type="button" class="btn sm" @click="addBannedIp">Add IP</button>
          </div>
          <div v-if="form.bannedIps.length" class="ag-ban-list">
            <span v-for="ip in form.bannedIps" :key="ip" class="ag-ban-chip">
              <span class="mono">{{ ip }}</span>
              <button type="button" aria-label="Remove" @click="removeBannedIp(ip)">✕</button>
            </span>
          </div>
          <p v-else class="ag-desc">No banned IPs yet.</p>
        </div>

        <p v-if="message" class="ag-ok">{{ message }}</p>
        <p v-if="error" class="ag-err">{{ error }}</p>

        <div class="ag-actions">
          <button type="button" class="btn primary" :disabled="busy" @click="save">
            {{ busy ? 'Saving…' : 'Save access gate settings' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ag-panel { display: flex; flex-direction: column; gap: 16px; }
.ag-intro { margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; }
.ag-loading, .ag-map-fallback {
  display: grid; place-items: center; height: 120px; color: #64748b; font-size: 13px;
  border: 1px dashed #e2e8f0; border-radius: 12px;
}
.ag-map-fallback { height: 420px; }
.ag-toggle { align-items: flex-start; border-bottom: none; padding: 0; }
.ag-label { font-size: 13.5px; font-weight: 600; color: #0f172a; }
.ag-desc { margin-top: 2px; font-size: 12.5px; color: #64748b; line-height: 1.4; }
.ag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ag-maphead { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ag-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #475569; }
.ag-legend span { display: inline-flex; align-items: center; gap: 5px; }
.ag-sw { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.ag-maptools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.ag-filter { padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12.5px; background: #fff; }
.ag-hint { margin: 0; font-size: 12.5px; color: #4f46e5; }
.ag-stats { font-size: 12px; color: #94a3b8; }
.ag-bans { display: flex; flex-direction: column; gap: 8px; }
.ag-ban-add { display: flex; gap: 8px; }
.ag-ban-add input { flex: 1; min-width: 0; border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px 12px; font-size: 14px; }
.ag-ban-list { display: flex; flex-wrap: wrap; gap: 6px; }
.ag-ban-chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 999px; font-size: 12px; color: #b91c1c;
}
.ag-ban-chip button { border: none; background: transparent; color: #b91c1c; cursor: pointer; font-size: 12px; line-height: 1; }
.ag-ok { margin: 0; color: #059669; font-size: 13px; }
.ag-err { margin: 0; color: #dc2626; font-size: 13px; }
.ag-actions { display: flex; }
@media (max-width: 720px) {
  .ag-grid { grid-template-columns: 1fr; }
}
</style>
