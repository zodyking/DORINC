<script setup lang="ts">
import { formatDatabaseSizeGb, formatDatabaseSizeDelta } from '~/utils/admin-panel-ui'

defineProps<{
  embedded?: boolean
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

  const width = 640
  const height = 180
  const padX = 8
  const padY = 12
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const values = points.map(p => p.databaseBytes)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)

  const coords = points.map((point, index) => {
    const x = padX + (index / (points.length - 1)) * innerW
    const y = padY + innerH - ((point.databaseBytes - min) / range) * innerH
    return { x, y, point }
  })

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  const area = `${line} L ${coords[coords.length - 1]!.x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${coords[0]!.x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`

  return {
    width,
    height,
    line,
    area,
    minLabel: formatDatabaseSizeGb(min),
    maxLabel: formatDatabaseSizeGb(max),
    startLabel: formatChartDate(points[0]!.recordedAt),
    endLabel: formatChartDate(points[points.length - 1]!.recordedAt),
  }
})

function formatChartDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div :class="embedded ? 'cp-db-chart cp-db-chart--embedded' : 'card cp-db-chart'">
    <div :class="embedded ? 'cp-db-chart__head' : 'chead'">
      <h3>Database storage</h3>
      <div class="right">
        <button type="button" class="btn sm" :disabled="pending" @click="refresh()">
          {{ pending ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>
    <div :class="embedded ? 'cp-db-chart__body' : 'cbody'">
      <p v-if="error" class="settings-err">Could not load database size metrics.</p>
      <template v-else-if="data">
        <div class="cp-db-chart__stats">
          <div>
            <div class="cp-db-chart__label">Current size</div>
            <div class="cp-db-chart__value">{{ formatDatabaseSizeGb(data.currentBytes) }}</div>
          </div>
          <div v-if="data.change7dBytes != null">
            <div class="cp-db-chart__label">7-day change</div>
            <div
              class="cp-db-chart__value"
              :class="data.change7dBytes > 0 ? 'up' : data.change7dBytes < 0 ? 'down' : 'flat'"
            >
              {{ formatDatabaseSizeDelta(data.change7dBytes, data.change7dPercent) }}
            </div>
          </div>
          <div>
            <div class="cp-db-chart__label">Snapshots</div>
            <div class="cp-db-chart__value sm">{{ data.history.length }}</div>
          </div>
        </div>

        <div v-if="chart" class="cp-db-chart__plot-wrap">
          <svg
            class="cp-db-chart__plot"
            :viewBox="`0 0 ${chart.width} ${chart.height}`"
            role="img"
            aria-label="Database size over time"
          >
            <defs>
              <linearGradient id="cp-db-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.22" />
                <stop offset="100%" stop-color="#4f46e5" stop-opacity="0.02" />
              </linearGradient>
            </defs>
            <path :d="chart.area" fill="url(#cp-db-fill)" />
            <path :d="chart.line" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <div class="cp-db-chart__axis">
            <span>{{ chart.startLabel }} · {{ chart.minLabel }}</span>
            <span>{{ chart.endLabel }} · {{ chart.maxLabel }}</span>
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
.cp-db-chart__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
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
  font-size: 18px;
}
.cp-db-chart__value.up { color: #059669; }
.cp-db-chart__value.down { color: #2563eb; }
.cp-db-chart__value.flat { color: #64748b; }
.cp-db-chart__plot-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: linear-gradient(180deg, #fafbff 0%, #fff 100%);
  padding: 12px 12px 8px;
}
.cp-db-chart__plot {
  width: 100%;
  height: auto;
  display: block;
}
.cp-db-chart__axis {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  color: #94a3b8;
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
@media (max-width: 640px) {
  .cp-db-chart__stats {
    grid-template-columns: 1fr;
  }
}
</style>
