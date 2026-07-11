<script setup lang="ts">
import ControlPanelDatabaseChart from '~/components/admin/ControlPanelDatabaseChart.vue'
import { buildSystemMonitorItems, type SystemMonitorStatusInput } from '~/utils/admin-panel-ui'

const props = defineProps<{
  status: SystemMonitorStatusInput
}>()

const items = computed(() => buildSystemMonitorItems(props.status))
</script>

<template>
  <div class="card cp-monitor">
    <div class="chead">
      <div>
        <h3>System Monitor</h3>
        <p class="cp-monitor__intro">
          Live health for database, mail, workers, backups, and AI. Configuration is stored encrypted in PostgreSQL.
        </p>
      </div>
    </div>

    <div class="cbody">
      <div class="cp-monitor__strip" role="list" aria-label="System status overview">
        <div
          v-for="item in items"
          :key="`${item.id}-strip`"
          class="cp-monitor__chip"
          role="listitem"
          :aria-label="`${item.label}: ${item.statusText}`"
        >
          <span class="cp-monitor__dot" :class="item.tone" aria-hidden="true" />
          <span class="cp-monitor__chip-label">{{ item.label }}</span>
        </div>
      </div>

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

      <div class="cp-monitor__storage">
        <ControlPanelDatabaseChart embedded />
      </div>
    </div>
  </div>
</template>
