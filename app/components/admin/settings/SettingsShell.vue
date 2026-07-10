<script setup lang="ts">
export type SettingsSection
  = | 'overview'
    | 'business'
    | 'email'
    | 'invoice'
    | 'catalog'
    | 'line-detection'
    | 'designer'
    | 'import'
    | 'backup'
    | 'ai'
    | 'security'

export interface SettingsNavGroup {
  label: string
  items: { id: SettingsSection, label: string, icon?: string }[]
}

defineProps<{
  groups: SettingsNavGroup[]
  active: SettingsSection
}>()

const emit = defineEmits<{ navigate: [SettingsSection] }>()
</script>

<template>
  <div class="settings-shell">
    <aside class="settings-nav" aria-label="Settings sections">
      <div v-for="group in groups" :key="group.label" class="settings-nav-group">
        <p class="settings-nav-label">{{ group.label }}</p>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="settings-nav-item"
          :class="{ on: active === item.id }"
          :aria-current="active === item.id ? 'page' : undefined"
          @click="emit('navigate', item.id)"
        >
          <span v-if="item.icon" class="settings-nav-icon" aria-hidden="true">{{ item.icon }}</span>
          {{ item.label }}
        </button>
      </div>
    </aside>
    <div class="settings-main">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.settings-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.settings-nav {
  position: sticky;
  top: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 10px;
}

.settings-nav-group + .settings-nav-group {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
}

.settings-nav-label {
  margin: 0 8px 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  appearance: none;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 9px 10px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
}

.settings-nav-item:hover {
  background: #f8fafc;
  color: #0f172a;
}

.settings-nav-item.on {
  background: #eef2ff;
  color: #4338ca;
  font-weight: 600;
}

.settings-nav-icon {
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.settings-main {
  min-width: 0;
}

@media (max-width: 900px) {
  .settings-shell {
    grid-template-columns: 1fr;
  }
  .settings-nav {
    position: static;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px;
  }
  .settings-nav-group {
    display: contents;
    margin: 0;
    padding: 0;
    border: none;
  }
  .settings-nav-label {
    width: 100%;
    margin: 8px 0 4px;
  }
  .settings-nav-label:first-child {
    margin-top: 0;
  }
  .settings-nav-item {
    width: auto;
    flex: 0 1 auto;
  }
}
</style>
