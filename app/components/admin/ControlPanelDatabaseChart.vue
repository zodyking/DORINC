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

const hoveredIndex = ref<number | null>(null)

const chart = computed(() => {
  const points = data.value?.history ?? []
  if (points.length < 2) return null

  const width = 720
  const height = 260
  const padLeft = 52
  const padRight = 16
  const padTop = 18
  const padBottom = 28
  const innerW = width - padLeft - padRight
  const innerH = height - padTop - padBottom

  const values = points.map(p => p.databaseBytes)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const padding = Math.max((rawMax - rawMin) * 0.12, rawMax * 0.02, 1024 * 1024)
  const min = Math.max(0, rawMin - padding)
  const max = rawMax + padding
  const range = Math.max(max - min, 1)

  const yFor = (bytes: number) => padTop + innerH - ((bytes - min) / range) * innerH

  const coords = points.map((point, index) => {
    const x = padLeft + (index / (points.length - 1)) * innerW
    const y = yFor(point.databaseBytes)
    return { x, y, point, index }
  })

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  const area = `${line} L ${coords[coords.length - 1]!.x.toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${coords[0]!.x.toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`

  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const value = min + (range * i) / 4
    const y = yFor(value)
    return {
      y,
      label: formatDatabaseSizeGb(value),
    }
  })

  const xLabels = [
    { x: coords[0]!.x, label: formatChartDate(points[0]!.recordedAt) },
    { x: coords[Math.floor(coords.length / 2)]!.x, label: formatChartDate(points[Math.floor(points.length / 2)]!.recordedAt) },
    { x: coords[coords.length - 1]!.x, label: formatChartDate(points[points.length - 1]!.recordedAt) },
  ]

  return {
    width,
    height,
    padLeft,
    padTop,
    innerW,
    innerH,
    line,
    area,
    coords,
    gridLines,
    xLabels,
    minLabel: formatDatabaseSizeGb(rawMin),
    maxLabel: formatDatabaseSizeGb(rawMax),
  }
})

function formatChartDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatPointLabel(iso: string, bytes: number): string {
  return `${formatChartDate(iso)} · ${formatDatabaseSizeGb(bytes)}`
}
</script>

<template>
  <div
    :class="[
      hero ? 'card cp-db-chart cp-db-chart--hero' : embedded ? 'cp-db-chart cp-db-chart--embedded' : 'card cp-db-chart',
    ]"
  >
    <div :class="embedded && !hero ? 'cp-db-chart__head' : 'chead'">
      <div>
        <h3>Database storage</h3>
        <p v-if="hero" class="cp-db-chart__lead">
          PostgreSQL footprint over time — snapshots every ~6 hours.
        </p>
      </div>
      <div class="right">
        <button type="button" class="btn sm" :disabled="pending" @click="refresh()">
          {{ pending ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>
    <div :class="embedded && !hero ? 'cp-db-chart__body' : 'cbody'">
      <p v-if="error" class="settings-err">Could not load database size metrics.</p>
      <template v-else-if="data">
        <div class="cp-db-chart__stats">
          <div class="cp-db-chart__stat">
            <div class="cp-db-chart__label">Current size</div>
            <div class="cp-db-chart__value">{{ formatDatabaseSizeGb(data.currentBytes) }}</div>
          </div>
          <div v-if="data.change7dBytes != null" class="cp-db-chart__stat">
            <div class="cp-db-chart__label">7-day change</div>
            <div
              class="cp-db-chart__value"
              :class="data.change7dBytes > 0 ? 'up' : data.change7dBytes < 0 ? 'down' : 'flat'"
            >
              {{ formatDatabaseSizeDelta(data.change7dBytes, data.change7dPercent) }}
            </div>
          </div>
          <div class="cp-db-chart__stat">
            <div class="cp-db-chart__label">Snapshots</div>
            <div class="cp-db-chart__value sm">{{ data.history.length }}</div>
          </div>
          <div v-if="chart" class="cp-db-chart__stat cp-db-chart__stat--range">
            <div class="cp-db-chart__label">Chart range</div>
            <div class="cp-db-chart__value sm">{{ chart.minLabel }} – {{ chart.maxLabel }}</div>
          </div>
        </div>

        <div v-if="chart" class="cp-db-chart__plot-wrap cp-db-chart__plot-wrap--rich">
          <svg
            class="cp-db-chart__plot"
            :viewBox="`0 0 ${chart.width} ${chart.height}`"
            role="img"
            aria-label="Database size over time"
            @mouseleave="hoveredIndex = null"
          >
            <defs>
              <linearGradient id="cp-db-fill-rich" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.28" />
                <stop offset="55%" stop-color="#6366f1" stop-opacity="0.12" />
                <stop offset="100%" stop-color="#818cf8" stop-opacity="0.02" />
              </linearGradient>
              <linearGradient id="cp-db-line-rich" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#4338ca" />
                <stop offset="100%" stop-color="#6366f1" />
              </linearGradient>
            </defs>

            <rect
              :x="chart.padLeft"
              :y="chart.padTop"
              :width="chart.innerW"
              :height="chart.innerH"
              fill="#fafbff"
              rx="8"
            />

            <g class="cp-db-chart__grid">
              <line
                v-for="(grid, i) in chart.gridLines"
                :key="`grid-${i}`"
                :x1="chart.padLeft"
                :x2="chart.padLeft + chart.innerW"
                :y1="grid.y"
                :y2="grid.y"
              />
              <text
                v-for="(grid, i) in chart.gridLines"
                :key="`label-${i}`"
                :x="chart.padLeft - 8"
                :y="grid.y + 4"
                text-anchor="end"
              >
                {{ grid.label }}
              </text>
            </g>

            <path :d="chart.area" fill="url(#cp-db-fill-rich)" />
            <path :d="chart.line" fill="none" stroke="url(#cp-db-line-rich)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

            <g class="cp-db-chart__points">
              <circle
                v-for="coord in chart.coords"
                :key="coord.index"
                :cx="coord.x"
                :cy="coord.y"
                :r="hoveredIndex === coord.index ? 6 : 4"
                :class="{ active: hoveredIndex === coord.index }"
                :aria-label="formatPointLabel(coord.point.recordedAt, coord.point.databaseBytes)"
                @mouseenter="hoveredIndex = coord.index"
              />
            </g>

            <g class="cp-db-chart__xlabels">
              <text
                v-for="(item, i) in chart.xLabels"
                :key="`x-${i}`"
                :x="item.x"
                :y="chart.height - 8"
                text-anchor="middle"
              >
                {{ item.label }}
              </text>
            </g>
          </svg>

          <div v-if="hoveredIndex != null && chart.coords[hoveredIndex]" class="cp-db-chart__tooltip">
            {{ formatPointLabel(chart.coords[hoveredIndex]!.point.recordedAt, chart.coords[hoveredIndex]!.point.databaseBytes) }}
          </div>
        </div>
        <p v-else class="cp-db-chart__empty">
          Size history builds automatically — a snapshot is recorded about every 6 hours.
          Check back after the next snapshot for a growth chart.
        </p>
        <p v-if="data.lastSnapshotAt" class="cp-db-chart__meta">
          Last snapshot {{ new Date(data.lastSnapshotAt).toLocaleString() }}
        </p>
      </template>
      <p v-else-if="pending" class="cp-db-chart__empty">Loading database metrics…</p>
    </div>
  </div>
</template>

<style scoped>
.cp-db-chart__lead {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
  font-weight: 400;
}
.cp-db-chart__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.cp-db-chart__stat {
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
}
.cp-db-chart__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.cp-db-chart__value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}
.cp-db-chart__value.sm {
  font-size: 16px;
}
.cp-db-chart__value.up { color: #059669; }
.cp-db-chart__value.down { color: #2563eb; }
.cp-db-chart__value.flat { color: #64748b; }
.cp-db-chart__plot-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: linear-gradient(180deg, #fafbff 0%, #fff 100%);
  padding: 12px 12px 8px;
  position: relative;
}
.cp-db-chart__plot-wrap--rich {
  padding: 14px 14px 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.cp-db-chart__plot {
  width: 100%;
  height: auto;
  display: block;
}
.cp-db-chart__grid line {
  stroke: #e2e8f0;
  stroke-width: 1;
  stroke-dasharray: 4 4;
}
.cp-db-chart__grid text {
  fill: #94a3b8;
  font-size: 10px;
  font-weight: 600;
}
.cp-db-chart__points circle {
  fill: #fff;
  stroke: #4f46e5;
  stroke-width: 2.5;
  cursor: pointer;
  transition: r 0.12s ease;
}
.cp-db-chart__points circle.active {
  fill: #4f46e5;
  stroke: #312e81;
}
.cp-db-chart__xlabels text {
  fill: #64748b;
  font-size: 11px;
  font-weight: 600;
}
.cp-db-chart__tooltip {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}
.cp-db-chart__empty,
.cp-db-chart__meta {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
}
.cp-db-chart__meta {
  margin-top: 10px;
  font-size: 12px;
  color: #94a3b8;
}
@media (max-width: 900px) {
  .cp-db-chart__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .cp-db-chart__stats {
    grid-template-columns: 1fr;
  }
}
</style>
