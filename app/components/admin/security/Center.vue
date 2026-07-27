<script setup lang="ts">
import type { GeoPoint } from '#shared/geo/point-in-polygon'
import type {
  IpBanStatus,
  SecurityPolicy,
  SecurityZoneKind,
} from '#shared/validators/security-access'
import { DEFAULT_SECURITY_POLICY } from '#shared/validators/security-access'
import type {
  SecurityBan,
  SecurityEvent,
  SecurityOverview,
  SecurityThreat,
  SecurityZone,
} from '~/utils/security-center'
import { MARKER_COLORS } from '~/utils/security-center'

type Tab = 'map' | 'bans' | 'zones' | 'events' | 'threats' | 'policy'

const TABS: Array<{ id: Tab, label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'threats', label: 'Repeat attempts' },
  { id: 'bans', label: 'IP bans' },
  { id: 'zones', label: 'Zones' },
  { id: 'events', label: 'Events' },
  { id: 'policy', label: 'Policy' },
]

const activeTab = ref<Tab>('map')

const overview = ref<SecurityOverview | null>(null)
const events = ref<SecurityEvent[]>([])
const eventsTotal = ref(0)
const bans = ref<SecurityBan[]>([])
const bansTotal = ref(0)
const zones = ref<SecurityZone[]>([])
const threats = ref<SecurityThreat[]>([])

const savedPolicy = ref<SecurityPolicy>({ ...DEFAULT_SECURITY_POLICY })
const policy = ref<SecurityPolicy>({ ...DEFAULT_SECURITY_POLICY })

const loading = reactive({
  overview: false,
  events: false,
  bans: false,
  zones: false,
  threats: false,
  policy: false,
  saving: false,
})

const feedback = ref('')
const problem = ref('')

const eventFilters = reactive({
  eventType: '' as '' | 'visit' | 'login',
  outcome: '' as '' | 'allowed' | 'blocked' | 'would_block' | 'login_success' | 'login_failed',
  search: '',
  sinceHours: 168,
})
const banFilters = reactive({ status: 'active' as IpBanStatus | 'all', search: '' })
const threatWindowHours = ref(168)

const drawing = ref(false)
const editingZoneId = ref<string | null>(null)
const pendingTrace = ref<GeoPoint[] | null>(null)
const banPrefillIp = ref('')

const policyDirty = computed(() => JSON.stringify(policy.value) !== JSON.stringify(savedPolicy.value))

/** Events for the map: only the ones we could actually place. */
const mappedEvents = computed(() => events.value.filter(e => e.latitude != null && e.longitude != null))

function note(message: string) {
  feedback.value = message
  problem.value = ''
  setTimeout(() => { if (feedback.value === message) feedback.value = '' }, 5000)
}

function fail(err: unknown, fallback: string) {
  const data = (err as { data?: { message?: string, data?: { message?: string } } })?.data
  problem.value = data?.message ?? data?.data?.message ?? fallback
  feedback.value = ''
}

async function loadOverview() {
  loading.overview = true
  try {
    overview.value = await $fetch<SecurityOverview>('/api/admin/security/overview')
  }
  catch {
    overview.value = null
  }
  finally {
    loading.overview = false
  }
}

async function loadPolicy() {
  loading.policy = true
  try {
    const res = await $fetch<{ policy: SecurityPolicy }>('/api/admin/security/policy')
    savedPolicy.value = res.policy
    policy.value = structuredClone(toRaw(res.policy))
  }
  catch (err) {
    fail(err, 'Could not load the security policy')
  }
  finally {
    loading.policy = false
  }
}

async function loadEvents() {
  loading.events = true
  try {
    const res = await $fetch<{ items: SecurityEvent[], total: number }>('/api/admin/security/events', {
      query: {
        ...(eventFilters.eventType ? { eventType: eventFilters.eventType } : {}),
        ...(eventFilters.outcome ? { outcome: eventFilters.outcome } : {}),
        ...(eventFilters.search ? { search: eventFilters.search } : {}),
        sinceHours: eventFilters.sinceHours,
        limit: 1000,
      },
    })
    events.value = res.items
    eventsTotal.value = res.total
  }
  catch (err) {
    events.value = []
    eventsTotal.value = 0
    fail(err, 'Could not load access events')
  }
  finally {
    loading.events = false
  }
}

async function loadBans() {
  loading.bans = true
  try {
    const res = await $fetch<{ items: SecurityBan[], total: number }>('/api/admin/security/ip-bans', {
      query: { status: banFilters.status, ...(banFilters.search ? { search: banFilters.search } : {}) },
    })
    bans.value = res.items
    bansTotal.value = res.total
  }
  catch (err) {
    fail(err, 'Could not load the ban list')
  }
  finally {
    loading.bans = false
  }
}

async function loadZones() {
  loading.zones = true
  try {
    const res = await $fetch<{ items: SecurityZone[] }>('/api/admin/security/geofences')
    zones.value = res.items
  }
  catch (err) {
    fail(err, 'Could not load geofence zones')
  }
  finally {
    loading.zones = false
  }
}

async function loadThreats() {
  loading.threats = true
  try {
    const res = await $fetch<{ items: SecurityThreat[] }>('/api/admin/security/events/threats', {
      query: { sinceHours: threatWindowHours.value, minAttempts: 2, limit: 200 },
    })
    threats.value = res.items
  }
  catch (err) {
    fail(err, 'Could not load repeated attempts')
  }
  finally {
    loading.threats = false
  }
}

async function savePolicy() {
  loading.saving = true
  try {
    const res = await $fetch<{ policy: SecurityPolicy }>('/api/admin/security/policy', {
      method: 'PATCH',
      body: policy.value,
    })
    savedPolicy.value = res.policy
    policy.value = structuredClone(toRaw(res.policy))
    note('Security policy saved')
    void loadOverview()
  }
  catch (err) {
    fail(err, 'Could not save the security policy')
  }
  finally {
    loading.saving = false
  }
}

function resetPolicy() {
  policy.value = structuredClone(toRaw(savedPolicy.value))
}

function patchPolicy(patch: Partial<SecurityPolicy>) {
  policy.value = { ...policy.value, ...patch }
}

async function createBan(payload: { ipRule: string, reason: string, notes: string, expiresAt: string | null }) {
  try {
    await $fetch('/api/admin/security/ip-bans', {
      method: 'POST',
      body: { ...payload, source: 'manual' },
    })
    note(`Banned ${payload.ipRule}`)
    banPrefillIp.value = ''
    await Promise.all([loadBans(), loadOverview(), loadThreats()])
  }
  catch (err) {
    fail(err, 'Could not add the ban')
  }
}

async function updateBan(payload: { id: string, status?: IpBanStatus, liftReason?: string }) {
  try {
    await $fetch(`/api/admin/security/ip-bans/${payload.id}`, {
      method: 'PATCH',
      body: { status: payload.status, liftReason: payload.liftReason },
    })
    note('Ban updated')
    await Promise.all([loadBans(), loadOverview()])
  }
  catch (err) {
    fail(err, 'Could not update the ban')
  }
}

async function deleteBan(id: string) {
  try {
    await $fetch(`/api/admin/security/ip-bans/${id}`, { method: 'DELETE' })
    note('Ban deleted')
    await Promise.all([loadBans(), loadOverview()])
  }
  catch (err) {
    fail(err, 'Could not delete the ban')
  }
}

function startBanFor(ip: string) {
  banPrefillIp.value = ip
  activeTab.value = 'bans'
}

function onTrace(points: GeoPoint[]) {
  pendingTrace.value = points
  drawing.value = false
  activeTab.value = 'zones'
}

async function savePendingZone(meta: { name: string, kind: SecurityZoneKind, description: string }) {
  const polygon = pendingTrace.value
  if (!polygon) return

  try {
    if (editingZoneId.value) {
      await $fetch(`/api/admin/security/geofences/${editingZoneId.value}`, {
        method: 'PATCH',
        body: { polygon },
      })
      note('Zone shape replaced')
    }
    else {
      await $fetch('/api/admin/security/geofences', {
        method: 'POST',
        body: { ...meta, polygon, enabled: true },
      })
      note(`Zone "${meta.name}" saved`)
    }
    pendingTrace.value = null
    editingZoneId.value = null
    await Promise.all([loadZones(), loadOverview()])
  }
  catch (err) {
    fail(err, 'Could not save the zone')
  }
}

function discardPendingZone() {
  pendingTrace.value = null
  editingZoneId.value = null
}

async function toggleZone(payload: { id: string, enabled: boolean }) {
  try {
    await $fetch(`/api/admin/security/geofences/${payload.id}`, {
      method: 'PATCH',
      body: { enabled: payload.enabled },
    })
    await Promise.all([loadZones(), loadOverview()])
  }
  catch (err) {
    fail(err, 'Could not update the zone')
  }
}

function redrawZone(id: string) {
  if (editingZoneId.value === id) {
    editingZoneId.value = null
    drawing.value = false
    pendingTrace.value = null
    return
  }
  editingZoneId.value = id
  pendingTrace.value = null
  drawing.value = true
  activeTab.value = 'map'
}

async function deleteZone(id: string) {
  try {
    await $fetch(`/api/admin/security/geofences/${id}`, { method: 'DELETE' })
    if (editingZoneId.value === id) editingZoneId.value = null
    note('Zone deleted')
    await Promise.all([loadZones(), loadOverview()])
  }
  catch (err) {
    fail(err, 'Could not delete the zone')
  }
}

function toggleDrawing() {
  drawing.value = !drawing.value
  if (drawing.value) activeTab.value = 'map'
  else if (!pendingTrace.value) editingZoneId.value = null
}

watch(() => [eventFilters.eventType, eventFilters.outcome, eventFilters.sinceHours], () => {
  void loadEvents()
})

let eventSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => eventFilters.search, () => {
  if (eventSearchTimer) clearTimeout(eventSearchTimer)
  eventSearchTimer = setTimeout(() => void loadEvents(), 300)
})

watch(threatWindowHours, () => { void loadThreats() })

onMounted(() => {
  void Promise.all([loadOverview(), loadPolicy(), loadEvents(), loadBans(), loadZones(), loadThreats()])
})
</script>

<template>
  <div class="stack sc-root">
    <div class="card">
      <div class="chead">
        <h3>Security centre</h3>
        <div class="right">
          <span class="pill" :class="policy.enabled ? 'warn' : 'gray'">
            {{ policy.enabled ? 'Active' : 'Off' }}
          </span>
        </div>
      </div>

      <div class="cbody sc-head">
        <p class="sc-intro">
          Every page load and sign-in is checked against the IP ban list and the geofence zones, then plotted
          here. Site loads are located from the visitor's IP by a background worker so nothing slows down;
          staff sign-ins are checked against the device's own GPS fix.
        </p>

        <dl v-if="overview" class="sc-stats">
          <div>
            <dt>Blocked (24h)</dt>
            <dd :class="{ 'sc-alert': overview.events.blocked24h > 0 }">
              {{ overview.events.blocked24h }}
            </dd>
          </div>
          <div>
            <dt>Would block (24h)</dt>
            <dd>{{ overview.events.wouldBlock24h }}</dd>
          </div>
          <div>
            <dt>Failed sign-ins (24h)</dt>
            <dd :class="{ 'sc-alert': overview.events.failedLogins24h > 0 }">
              {{ overview.events.failedLogins24h }}
            </dd>
          </div>
          <div>
            <dt>Unique IPs (24h)</dt>
            <dd>{{ overview.events.uniqueIps24h }}</dd>
          </div>
          <div>
            <dt>Active bans</dt>
            <dd>{{ overview.activeBans }}</dd>
          </div>
          <div>
            <dt>Active zones</dt>
            <dd>{{ overview.zones.enabled }}</dd>
          </div>
          <div>
            <dt>Awaiting location</dt>
            <dd>{{ overview.events.unmappedEvents }}</dd>
          </div>
        </dl>

        <p v-if="feedback" class="sc-ok" role="status">
          {{ feedback }}
        </p>
        <p v-if="problem" class="sc-err" role="alert">
          {{ problem }}
        </p>
      </div>

      <div class="sc-tabs" role="tablist" aria-label="Security centre sections">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          role="tab"
          class="sc-tab"
          :class="{ active: activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-show="activeTab === 'map'" class="card">
      <div class="chead">
        <h3>Security map</h3>
        <div class="right sc-maptools">
          <select v-model="eventFilters.eventType" class="sc-select" aria-label="Event type">
            <option value="">
              All events
            </option>
            <option value="login">
              Sign-ins
            </option>
            <option value="visit">
              Visits
            </option>
          </select>
          <select v-model.number="eventFilters.sinceHours" class="sc-select" aria-label="Time window">
            <option :value="24">
              Last 24 hours
            </option>
            <option :value="168">
              Last 7 days
            </option>
            <option :value="720">
              Last 30 days
            </option>
          </select>
          <button type="button" class="btn sm" :disabled="loading.events" @click="loadEvents">
            {{ loading.events ? '…' : 'Refresh' }}
          </button>
          <button type="button" class="btn sm" :class="{ primary: drawing }" @click="toggleDrawing">
            {{ drawing ? 'Done drawing' : 'Draw zone' }}
          </button>
        </div>
      </div>

      <div class="cbody sc-mapbody">
        <p v-if="drawing" class="sc-hint">
          Press and drag on the map to trace an area, then release. You will be asked to name it before it
          takes effect.
        </p>

        <ClientOnly>
          <AdminSecurityMap
            :events="mappedEvents"
            :zones="zones"
            :drawing="drawing"
            :editing-zone-id="editingZoneId"
            @trace="onTrace"
            @ban-ip="startBanFor"
            @select-zone="redrawZone"
          />
          <template #fallback>
            <div class="sc-mapfallback">
              Loading map…
            </div>
          </template>
        </ClientOnly>

        <div class="sc-legend">
          <span><i class="sc-sw" :style="{ background: MARKER_COLORS.loginSuccess }" /> Signed in</span>
          <span><i class="sc-sw" :style="{ background: MARKER_COLORS.loginFailed }" /> Failed sign-in</span>
          <span><i class="sc-sw" :style="{ background: MARKER_COLORS.visit }" /> Visit</span>
          <span><i class="sc-sw" :style="{ background: MARKER_COLORS.wouldBlock }" /> Would block</span>
          <span><i class="sc-sw" :style="{ background: MARKER_COLORS.blocked }" /> Blocked</span>
          <span class="sc-legend__count">
            {{ mappedEvents.length }} of {{ events.length }} events placed
          </span>
        </div>
      </div>
    </div>

    <AdminSecurityThreatTable
      v-show="activeTab === 'threats'"
      :threats="threats"
      :loading="loading.threats"
      :window-hours="threatWindowHours"
      @ban-ip="startBanFor"
      @update:window-hours="threatWindowHours = $event"
      @refresh="loadThreats"
    />

    <AdminSecurityBanTable
      v-show="activeTab === 'bans'"
      :bans="bans"
      :total="bansTotal"
      :loading="loading.bans"
      :prefill-ip="banPrefillIp"
      @create="createBan"
      @update="updateBan"
      @delete="deleteBan"
      @refresh="loadBans"
      @clear-prefill="banPrefillIp = ''"
      @update:status="banFilters.status = $event; loadBans()"
      @update:search="banFilters.search = $event; loadBans()"
    />

    <AdminSecurityZoneTable
      v-show="activeTab === 'zones'"
      :zones="zones"
      :loading="loading.zones"
      :editing-zone-id="editingZoneId"
      :has-pending-trace="!!pendingTrace"
      @save-pending="savePendingZone"
      @discard-pending="discardPendingZone"
      @toggle="toggleZone"
      @redraw="redrawZone"
      @delete="deleteZone"
      @refresh="loadZones"
    />

    <div v-show="activeTab === 'events'" class="stack">
      <div class="card">
        <div class="cbody sc-eventfilters">
          <label class="fld">
            Search
            <input v-model="eventFilters.search" type="search" placeholder="Username, IP, location, path">
          </label>
          <label class="fld">
            Outcome
            <select v-model="eventFilters.outcome">
              <option value="">All outcomes</option>
              <option value="blocked">Blocked</option>
              <option value="would_block">Would block</option>
              <option value="login_failed">Failed sign-in</option>
              <option value="login_success">Signed in</option>
              <option value="allowed">Allowed</option>
            </select>
          </label>
          <label class="fld">
            Type
            <select v-model="eventFilters.eventType">
              <option value="">All events</option>
              <option value="login">Sign-ins</option>
              <option value="visit">Visits</option>
            </select>
          </label>
          <label class="fld">
            Window
            <select v-model.number="eventFilters.sinceHours">
              <option :value="24">Last 24 hours</option>
              <option :value="168">Last 7 days</option>
              <option :value="720">Last 30 days</option>
            </select>
          </label>
        </div>
      </div>

      <AdminSecurityEventTable
        :events="events"
        :total="eventsTotal"
        :loading="loading.events"
        @ban-ip="startBanFor"
      />
    </div>

    <AdminSecurityPolicyForm
      v-show="activeTab === 'policy'"
      :policy="policy"
      :saving="loading.saving"
      :dirty="policyDirty"
      @update="patchPolicy"
      @save="savePolicy"
      @reset="resetPolicy"
    />
  </div>
</template>

<style scoped>
.sc-head { display: flex; flex-direction: column; gap: 14px; }
.sc-intro { margin: 0; font-size: 13px; line-height: 1.6; color: #64748b; max-width: 85ch; }
.sc-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin: 0;
}
.sc-stats dt {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
}
.sc-stats dd { margin: 2px 0 0; font-size: 20px; font-weight: 700; color: #0f172a; }
.sc-stats dd.sc-alert { color: #dc2626; }
.sc-ok { margin: 0; color: #059669; font-size: 13px; font-weight: 600; }
.sc-err { margin: 0; color: #dc2626; font-size: 13px; font-weight: 600; }

.sc-tabs {
  display: flex;
  gap: 2px;
  padding: 0 18px;
  border-top: 1px solid #f1f5f9;
  overflow-x: auto;
  scrollbar-width: none;
}
.sc-tabs::-webkit-scrollbar { display: none; }
.sc-tab {
  border: none;
  background: transparent;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}
.sc-tab:hover { color: #334155; }
.sc-tab.active { color: #4f46e5; border-bottom-color: #4f46e5; }
.sc-tab:focus-visible { outline: 2px solid #4f46e5; outline-offset: -2px; }

.sc-maptools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.sc-select {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12.5px;
  background: #fff;
}
.sc-mapbody { display: flex; flex-direction: column; gap: 12px; }
.sc-hint { margin: 0; font-size: 12.5px; color: #4f46e5; line-height: 1.5; }
.sc-mapfallback {
  display: grid;
  place-items: center;
  height: 460px;
  color: #64748b;
  font-size: 13px;
  border: 1px dashed #e2e8f0;
  border-radius: 12px;
}
.sc-legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #475569;
  align-items: center;
}
.sc-legend span { display: inline-flex; align-items: center; gap: 5px; }
.sc-legend__count { margin-left: auto; color: #94a3b8; }
.sc-sw { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }

.sc-eventfilters {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 4px 14px;
}
@media (max-width: 900px) {
  .sc-eventfilters { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .sc-eventfilters { grid-template-columns: 1fr; }
  .sc-mapfallback { height: 340px; }
}
</style>
