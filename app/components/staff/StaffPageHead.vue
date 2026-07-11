<script setup lang="ts">
import PageActionsMenu from './PageActionsMenu.vue'

defineProps<{
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <div class="pagehead">
    <div class="pagehead__main">
      <div class="pagehead__title-row">
        <h2>
          <slot name="title">{{ title }}</slot>
        </h2>
        <PageActionsMenu v-if="$slots.actions">
          <slot name="actions" />
        </PageActionsMenu>
      </div>
      <p v-if="subtitle || $slots.subtitle">
        <slot name="subtitle">{{ subtitle }}</slot>
      </p>
    </div>
  </div>
</template>
