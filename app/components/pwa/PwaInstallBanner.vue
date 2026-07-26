<script setup lang="ts">
const { canPromptInstall, install, installed, installHint } = usePwaInstall()
const { online, queueCount } = useOfflineQueue()

async function onInstall() {
  await install()
}

const showOfflineHint = computed(() => !online.value || queueCount.value > 0)
</script>

<template>
  <div class="pwa-banner" role="region" aria-label="App install and offline status">
    <div class="pwa-banner__row">
      <div>
        <strong>{{ installed ? 'DORINC app installed' : 'Install DORINC' }}</strong>
        <p>{{ installHint }}</p>
      </div>
      <div v-if="canPromptInstall" class="pwa-banner__actions">
        <button type="button" class="btn sm primary" @click="onInstall">Install</button>
      </div>
    </div>
    <p v-if="showOfflineHint" class="pwa-banner__offline">
      <span v-if="!online">You are offline — changes will queue until connection returns.</span>
      <span v-else-if="queueCount > 0">{{ queueCount }} queued action{{ queueCount === 1 ? '' : 's' }} pending sync.</span>
    </p>
  </div>
</template>

<style scoped>
.pwa-banner {
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: var(--surface-2, #f8fafc);
  font-size: 13px;
}
.pwa-banner__row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}
.pwa-banner__row p {
  margin: 2px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
}
.pwa-banner__actions {
  display: flex;
  gap: 8px;
}
.pwa-banner__offline {
  margin: 8px 0 0;
  color: var(--warn, #b45309);
  font-size: 12px;
}
</style>
