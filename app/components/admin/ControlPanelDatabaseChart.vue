<script setup lang="ts">
import { formatDatabaseSizeGb, formatDatabaseSizeDelta } from '~/utils/admin-panel-ui'

defineProps<{
  embedded?: boolean
  hero?: boolean
}>()

interface DatabaseSizePoint {
  recordedAt: string
  databaseBytes: number
}

interface DatabaseSizeMetrics {
  currentBytes: number
  history: DatabaseSizePoint[]
  lastSnapshotAt: string | null
  change7dBytes: number | null
  change7dPercent: number | null
}

const { data, pending, error, refresh } = await useFetch<DatabaseSizeMetrics>('/api/admin/system/database-size')

const chart = computed(() => {
  const points = data.value?.history ?? []
  if (points.length < 2) return null

  const width = 720
  const height = 120
  const padX = 12
  const padY = 10
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const values = points.map(p => p.databaseBytes)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const flat = rawMax - rawMin < Math.max(rawMax * 0.002, 64 * 1024)
  const padding = flat ? Math.max(rawMax * 0.08, 256 * 1024) : Math.max((rawMax - rawMin) * 0.15, 128 * 1024)
  const min = Math.max(0, rawMin - padding)
  const max = rawMax + padding
  const range = Math.max(max - min, 1)

  const coords = points.map((point, index) => {
    const x = padX + (index / (points.length - 1)) * innerW
    const y = padY + innerH - ((point.databaseBytes - min) / range) * innerH
    return { x, y, point, index }
  })

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  const area = `${line} L ${coords[coords.length - 1]!.x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${coords[0]!.x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`

  return { width, height, line, area, coords, flat }
})

const changeClass = computed(() => {
  const bytes = data.value?.change7dBytes
  if (bytes == null || bytes === 0) return 'flat'
  return bytes > 0 ? 'up' : 'down'
})
</script>

<template>
  <div :class="hero ? 'card cp-storage-hero' : embedded ? 'cp-db-chart cp-db-chart--embedded' : 'card cp-db-chart'">
    <div class="cp-storage-hero__head">
      <div>
        <p class="cp-storage-hero__eyebrow">PostgreSQL storage</p>
        <div class="cp-storage-hero__metric-row">
          <strong class="cp-storage-hero__size">{{ data ? formatDatabaseSizeGb(data.currentBytes) : '—' }}</strong>
          <span
            v-if="data?.change7dBytes != null"
            class="cp-storage-hero__delta"
            :class="changeClass"
          >
            {{ formatDatabaseSizeDelta(data.change7dBytes, data.change7dPercent) }}
          </span>
        </div>
        <p class="cp-storage-hero__sub">
          {{ data?.history.length ?? 0 }} snapshots
          <template v-if="data?.lastSnapshotAt"> · last {{ new Date(data.lastSnapshotAt).toLocaleString() }}</template>
        </p>
      </div>
      <button type="button" class="btn sm" :disabled="pending" @click="refresh()">
        {{ pending ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="cp-storage-hero__body">
      <p class="settings-err">Could not load database size metrics.</p>
    </div>
    <div v-else-if="pending && !data" class="cp-storage-hero__body">
      <p class="cp-storage-hero__empty">Loading database metrics…</p>
    </div>
    <div v-else-if="data" class="cp-storage-hero__body">
      <div v-if="chart" class="cp-storage-hero__chart">
        <svg
          class="cp-storage-hero__plot"
          :viewBox="`0 0 ${chart.width} ${chart.height}`"
          role="img"
          aria-label="Database size trend"
        >
          <defs>
            <linearGradient id="cp-storage-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#6366f1" stop-opacity="0.35" />
              <stop offset="100%" stop-color="#6366f1" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          <path :d="chart.area" fill="url(#cp-storage-fill)" />
          <path :d="chart.line" fill="none" stroke="#4f46e5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          <circle
            v-for="coord in chart.coords"
            :key="coord.index"
            :cx="coord.x"
            :cy="coord.y"
            r="4"
            fill="#fff"
            stroke="#4f46e5"
            stroke-width="2"
          />
        </svg>
        <p v-if="chart.flat" class="cp-storage-hero__note">
          Growth is minimal so far — the chart will expand automatically as more snapshots accumulate.
        </p>
      </div>
      <p v-else class="cp-storage-hero__empty">
        Size history builds automatically every ~6 hours. Check back after the next snapshot for a trend line.
      </p>
    </div>
  </div>
</template>

<style scoped>
.cp-storage-hero {
  padding: 18px 20px 16px;
  background: linear-gradient(135deg, #ffffff 0%, #f8faff 52%, #f5f3ff 100%);
  border-color: #dbeafe;
}
.cp-storage-hero__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.cp-storage-hero__eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}
.cp-storage-hero__metric-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.cp-storage-hero__size {
  font-size: 34px;
  line-height: 1;
  font-weight: 800;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.cp-storage-hero__delta {
  font-size: 13px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
}
.cp-storage-hero__delta.up { background: #ecfdf5; color: #059669; }
.cp-storage-hero__delta.down { background: #eff6ff; color: #2563eb; }
.cp-storage-hero__delta.flat { background: #f8fafc; color: #64748b; }
.cp-storage-hero__sub {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
.cp-storage-hero__body { margin-top: 16px; }
.cp-storage-hero__chart {
  border: 1px solid #e0e7ff;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  padding: 10px 12px 8px;
}
.cp-storage-hero__plot {
  width: 100%;
  height: auto;
  display: block;
}
.cp-storage-hero__note,
.cp-storage-hero__empty {
  margin: 10px 0 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
}
</style>
