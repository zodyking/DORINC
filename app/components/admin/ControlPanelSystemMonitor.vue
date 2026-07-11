<script setup lang="ts">
import { buildSystemMonitorItems, type SystemMonitorStatusInput } from '~/utils/admin-panel-ui'

const props = defineProps<{
  status: SystemMonitorStatusInput
}>()

const items = computed(() => buildSystemMonitorItems(props.status))
</script>

<template>
  <div class="card cp-monitor cp-monitor--compact">
    <div class="chead">
      <div>
        <h3>System Monitor</h3>
        <p class="cp-monitor__intro">
          Live health for database, mail, workers, backups, and AI.
        </p>
      </div>
    </div>

    <div class="cbody">
      <div class="cp-monitor__rows" role="list" aria-label="System status details">
        <div
          v-for="item in items"
          :key="item.id"
          class="cp-monitor__row"
          role="listitem"
        >
          <span class="cp-monitor__dot" :class="item.tone" aria-hidden="true" />
          <span class="cp-monitor__row-label">{{ item.label }}</span>
          <span class="cp-monitor__row-summary">{{ item.summary }}</span>
          <span class="cp-monitor__row-status" :class="item.tone">{{ item.statusText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
