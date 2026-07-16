<script setup lang="ts">
defineProps<{
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <div class="pagehead portal-pagehead">
    <div class="pagehead__main">
      <div class="pagehead__title-row">
        <h2>
          <slot name="title">{{ title }}</slot>
        </h2>
        <div v-if="$slots.actions" class="actions">
          <slot name="actions" />
        </div>
      </div>
      <p v-if="subtitle || $slots.subtitle">
        <slot name="subtitle">{{ subtitle }}</slot>
      </p>
    </div>
  </div>
</template>
