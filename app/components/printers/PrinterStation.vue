<script setup lang="ts">
import { jamWord, paperWord } from '#shared/printers'

type Supply = { name: string, percent: number } | null
type Check = { label: string, value: string, bad: boolean }

defineProps<{
  queue: string
  label: string
  imageUrl: string
  pending?: boolean
  condition: {
    toner: Supply
    drum: Supply
    paper: 'unknown' | 'ready' | 'low' | 'empty'
    jam: 'unknown' | 'clear' | 'jam'
    mark: string
    note: string
  }
  supplyUrl?: string | null
  checks?: Check[]
}>()

function toneFor(percent: number | null | undefined) {
  if (percent == null) return ''
  if (percent <= 15) return 'low'
  if (percent <= 30) return 'mid'
  return 'ok'
}
</script>

<template>
  <div class="station">
    <div class="station-visual">
      <img
        class="printer-photo"
        :src="imageUrl"
        :alt="label"
        width="320"
        height="220"
      >
      <p v-if="pending" class="photo-pending">Looking up a product photo…</p>
    </div>
    <dl class="sensor-grid">
      <div class="sensor" :class="toneFor(condition.toner?.percent)">
        <dt>
          <a
            v-if="supplyUrl"
            class="supply-label"
            :href="supplyUrl"
            target="_blank"
            rel="noopener noreferrer"
            title="Lowest price on Amazon"
          >{{ condition.toner?.name || condition.mark }}</a>
          <span v-else>{{ condition.toner?.name || condition.mark }}</span>
        </dt>
        <dd>
          <strong>{{ condition.toner ? `${condition.toner.percent}%` : '—' }}</strong>
          <span v-if="condition.toner" class="level-track" role="meter" :aria-valuenow="condition.toner.percent" aria-valuemin="0" aria-valuemax="100">
            <span class="level-fill" :class="toneFor(condition.toner.percent)" :style="{ width: `${condition.toner.percent}%` }" />
          </span>
          <small v-if="condition.note">{{ condition.note }}</small>
        </dd>
      </div>
      <div class="sensor" :class="toneFor(condition.drum?.percent)">
        <dt>{{ condition.drum?.name || 'Drum' }}</dt>
        <dd>
          <strong>{{ condition.drum ? `${condition.drum.percent}%` : '—' }}</strong>
          <span v-if="condition.drum" class="level-track" role="meter" :aria-valuenow="condition.drum.percent" aria-valuemin="0" aria-valuemax="100">
            <span class="level-fill" :class="toneFor(condition.drum.percent)" :style="{ width: `${condition.drum.percent}%` }" />
          </span>
        </dd>
      </div>
      <div class="sensor" :class="{ bad: condition.paper === 'empty', warn: condition.paper === 'low', ok: condition.paper === 'ready' }">
        <dt>Paper</dt>
        <dd><strong>{{ paperWord(condition.paper) }}</strong></dd>
      </div>
      <div class="sensor" :class="{ bad: condition.jam === 'jam', ok: condition.jam === 'clear' }">
        <dt>Jam</dt>
        <dd><strong>{{ jamWord(condition.jam) }}</strong></dd>
      </div>
      <div v-for="row in checks || []" :key="row.label" class="sensor" :class="{ bad: row.bad }">
        <dt>{{ row.label }}</dt>
        <dd><strong>{{ row.value }}</strong></dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.station {
  display: grid;
  grid-template-columns: minmax(180px, 280px) 1fr;
  gap: 18px;
  align-items: stretch;
}
.station-visual {
  position: relative;
  isolation: isolate;
  background:
    radial-gradient(120% 80% at 50% 0%, #ffffff 0%, #e8eef7 55%, #dbe4f0 100%);
  border: 1px solid #d7e0ea;
  border-radius: 18px;
  overflow: hidden;
  min-height: 180px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.printer-photo {
  width: 100%;
  height: 100%;
  min-height: 180px;
  object-fit: contain;
  display: block;
  padding: 12px;
}
.photo-pending {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  margin: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.78);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}
.sensor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
.sensor {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid #e8eef5;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}
.sensor dt {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.sensor dd { margin: 6px 0 0; }
.sensor strong { font-size: 16px; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; }
.sensor small { display: block; margin-top: 4px; color: #64748b; font-size: 12px; }
.sensor.ok { border-color: #bbf7d0; background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%); }
.sensor.low, .sensor.bad { border-color: #fecaca; background: linear-gradient(180deg, #fef2f2 0%, #ffffff 100%); }
.sensor.mid, .sensor.warn { border-color: #fde68a; background: linear-gradient(180deg, #fffbeb 0%, #ffffff 100%); }
.level-track {
  display: block;
  height: 7px;
  margin-top: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}
.level-fill {
  display: block;
  height: 100%;
  background: #059669;
  border-radius: inherit;
}
.level-fill.mid { background: #d97706; }
.level-fill.low { background: #dc2626; }
.supply-label { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
@media (max-width: 720px) {
  .station { grid-template-columns: 1fr; }
  .station-visual { min-height: 200px; }
  .printer-photo { min-height: 200px; }
}
</style>
