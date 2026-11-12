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
  return ''
}
</script>

<template>
  <div class="station">
    <div class="station-visual">
      <img
        class="printer-photo"
        :src="imageUrl"
        :alt="label"
        width="260"
        height="180"
      >
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
          <strong>{{ condition.toner ? `${condition.toner.percent}%` : 'Not reported' }}</strong>
          <span v-if="condition.toner" class="level-track" role="meter" :aria-valuenow="condition.toner.percent" aria-valuemin="0" aria-valuemax="100">
            <span class="level-fill" :class="toneFor(condition.toner.percent)" :style="{ width: `${condition.toner.percent}%` }" />
          </span>
          <small v-if="condition.note">{{ condition.note }}</small>
        </dd>
      </div>
      <div class="sensor" :class="toneFor(condition.drum?.percent)">
        <dt>{{ condition.drum?.name || 'Drum' }}</dt>
        <dd>
          <strong>{{ condition.drum ? `${condition.drum.percent}%` : 'Not reported' }}</strong>
          <span v-if="condition.drum" class="level-track" role="meter" :aria-valuenow="condition.drum.percent" aria-valuemin="0" aria-valuemax="100">
            <span class="level-fill" :class="toneFor(condition.drum.percent)" :style="{ width: `${condition.drum.percent}%` }" />
          </span>
        </dd>
      </div>
      <div class="sensor" :class="{ bad: condition.paper === 'empty', warn: condition.paper === 'low' }">
        <dt>Paper</dt>
        <dd><strong>{{ paperWord(condition.paper) }}</strong></dd>
      </div>
      <div class="sensor" :class="{ bad: condition.jam === 'jam' }">
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
  grid-template-columns: minmax(160px, 220px) 1fr;
  gap: 16px;
  align-items: start;
}
.station-visual {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 13 / 9;
}
.printer-photo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #fff;
}
.sensor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
.sensor {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}
.sensor dt {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: #64748b;
}
.sensor dd {
  margin: 4px 0 0;
}
.sensor strong { font-size: 14px; }
.sensor small { display: block; margin-top: 4px; color: #64748b; font-size: 12px; }
.sensor.low, .sensor.bad { border-color: #fecaca; background: #fef2f2; }
.sensor.mid, .sensor.warn { border-color: #fde68a; background: #fffbeb; }
.level-track {
  display: block;
  height: 6px;
  margin-top: 6px;
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
  .sensor-grid { grid-template-columns: 1fr; }
}
</style>
