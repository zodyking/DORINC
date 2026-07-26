<script setup lang="ts">
const props = defineProps<{
  demo: string
}>()

const navHotspot = ref<string | null>(null)
const voicePhase = ref(0)
const photoCount = ref(0)
const searchQuery = ref('')
const assignModule = ref('')
const assignLock = ref(true)

const navItems = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Overview of open work and quick stats.' },
  { id: 'service-logs', label: 'Service Logs', hint: 'Create field logs with photos or voice line items.' },
  { id: 'customers', label: 'Customers', hint: 'Fleet accounts, contacts, and billing preferences.' },
  { id: 'invoices', label: 'Invoices', hint: 'Draft, approve, and send invoices to customers.' },
]

const voicePhases = [
  { label: 'Listening…', line: '"Labor — replaced DPF sensor"' },
  { label: 'Quantity', line: '"Two hours"' },
  { label: 'Rate', line: '"One forty-five an hour"' },
  { label: 'Line saved', line: 'Added to your digital log' },
]

let voiceTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (props.demo === 'voice-wizard') {
    voiceTimer = setInterval(() => {
      voicePhase.value = (voicePhase.value + 1) % voicePhases.length
    }, 2200)
  }
})

onUnmounted(() => {
  if (voiceTimer) clearInterval(voiceTimer)
})

function addPhoto() {
  if (photoCount.value < 4) photoCount.value += 1
}
</script>

<template>
  <div class="training-demo">
    <!-- Sidebar navigation demo -->
    <div v-if="demo === 'nav-sidebar'" class="training-demo-phone">
      <div class="training-demo-notch" />
      <div class="training-demo-screen" style="display:flex;gap:10px;padding:10px;">
        <div style="width:38%;background:#0f172a;border-radius:10px;padding:8px 6px;color:#e2e8f0;font-size:0.68rem;">
          <div
            v-for="item in navItems"
            :key="item.id"
            :style="{
              padding: '7px 6px',
              borderRadius: '8px',
              marginBottom: '4px',
              background: navHotspot === item.id ? '#4f46e5' : 'transparent',
              color: navHotspot === item.id ? '#fff' : '#cbd5e1',
              cursor: 'pointer',
            }"
            @click="navHotspot = item.id"
          >
            {{ item.label }}
          </div>
        </div>
        <div style="flex:1;font-size:0.75rem;color:#64748b;padding:6px;">
          <template v-if="navHotspot">
            <b style="color:#0f172a;display:block;margin-bottom:6px;">{{ navItems.find(i => i.id === navHotspot)?.label }}</b>
            {{ navItems.find(i => i.id === navHotspot)?.hint }}
          </template>
          <template v-else>
            Tap a sidebar item to learn what it does.
          </template>
        </div>
      </div>
    </div>

    <!-- Voice wizard demo -->
    <div v-else-if="demo === 'voice-wizard'" class="training-demo-phone">
      <div class="training-demo-notch" />
      <div class="training-demo-screen" style="text-align:center;">
        <div style="width:64px;height:64px;border-radius:50%;background:#eef2ff;margin:16px auto 10px;display:flex;align-items:center;justify-content:center;font-size:1.6rem;">
          🎙️
        </div>
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6366f1;margin-bottom:6px;">
          {{ voicePhases[voicePhase]?.label }}
        </div>
        <div style="font-size:0.9rem;font-weight:600;color:#0f172a;">
          {{ voicePhases[voicePhase]?.line }}
        </div>
        <div style="margin-top:16px;padding:10px;background:#f8fafc;border-radius:10px;text-align:left;font-size:0.78rem;color:#64748b;">
          Line items appear here as you speak each field.
        </div>
      </div>
    </div>

    <!-- Photo capture demo -->
    <div v-else-if="demo === 'photo-capture'" class="training-demo-phone">
      <div class="training-demo-notch" />
      <div class="training-demo-screen">
        <button type="button" class="btn primary sm" style="width:100%;margin-bottom:12px;" @click="addPhoto">
          Add photo
        </button>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
          <div
            v-for="n in photoCount"
            :key="n"
            style="aspect-ratio:4/3;background:linear-gradient(135deg,#e2e8f0,#f8fafc);border-radius:10px;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;font-size:0.72rem;color:#94a3b8;"
          >
            Page {{ n }}
          </div>
          <div
            v-if="photoCount < 4"
            style="aspect-ratio:4/3;border:2px dashed #cbd5e1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:0.72rem;color:#94a3b8;"
          >
            Tap Add photo
          </div>
        </div>
      </div>
    </div>

    <!-- Log status timeline -->
    <div v-else-if="demo === 'log-status'" style="padding:8px;">
      <div style="display:flex;flex-direction:column;gap:0;">
        <div v-for="(step, i) in ['Draft', 'Ready for review', 'Approved', 'Invoiced']" :key="step" style="display:flex;gap:12px;">
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div :style="{
              width: '12px', height: '12px', borderRadius: '50%',
              background: i <= 2 ? '#4f46e5' : '#e2e8f0',
            }" />
            <div v-if="i < 3" style="width:2px;height:28px;background:#e2e8f0;" />
          </div>
          <div style="padding-bottom:18px;">
            <b style="font-size:0.88rem;color:#0f172a;">{{ step }}</b>
          </div>
        </div>
      </div>
    </div>

    <!-- Customer search demo -->
    <div v-else-if="demo === 'customer-search'" class="training-demo-phone">
      <div class="training-demo-notch" />
      <div class="training-demo-screen">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search customer or bus #606"
          class="fld"
          style="width:100%;margin-bottom:10px;"
        >
        <div
          v-for="row in [
            { name: 'Acme Fleet Services', sub: 'Bus #606 · Freightliner M2' },
            { name: 'Metro Transit Co.', sub: 'Unit TAG-12 · IC CE' },
          ].filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.sub.toLowerCase().includes(searchQuery.toLowerCase()))"
          :key="row.name"
          style="padding:10px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;"
        >
          <b style="display:block;font-size:0.85rem;">{{ row.name }}</b>
          <span style="font-size:0.75rem;color:#64748b;">{{ row.sub }}</span>
        </div>
      </div>
    </div>

    <!-- Invoice wizard demo -->
    <div v-else-if="demo === 'invoice-wizard'" style="padding:8px;">
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
        <span v-for="(s, i) in ['Customer', 'Vehicle', 'Lines', 'Review']" :key="s" :class="['pill', i === 2 ? 'blue' : 'gray']" style="font-size:0.72rem;">{{ s }}</span>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;font-size:0.82rem;color:#64748b;">
        Line items table with catalog quick-add, live totals, and tax preview.
      </div>
    </div>

    <!-- Assign training demo -->
    <div v-else-if="demo === 'assign-training'" class="training-assign-panel">
      <label class="fld">
        Module
        <select v-model="assignModule">
          <option value="">Select module…</option>
          <option value="nav">Platform navigation</option>
          <option value="voice">Service logs with voice</option>
        </select>
      </label>
      <label class="tglrow" style="margin:0;">
        Lock access until complete
        <span class="tgl"><input v-model="assignLock" type="checkbox"><span class="tr" /></span>
      </label>
      <p class="help" style="margin:0;">
        When locked, the user only sees Training until they finish the assigned module.
      </p>
    </div>

    <p v-else class="help" style="margin:0;text-align:center;">
      Interactive preview for this lesson.
    </p>
  </div>
</template>
