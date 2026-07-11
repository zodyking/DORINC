<script setup lang="ts">
const props = defineProps<{
  id: string
  title: string
  icon?: string
  subtitle?: string
  open?: boolean
}>()

const emit = defineEmits<{
  'update:open': [boolean]
}>()

const isOpen = computed({
  get: () => props.open ?? false,
  set: (value: boolean) => emit('update:open', value),
})

function toggle() {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <section :id="`cp-section-${id}`" class="cp-section" :class="{ open: isOpen }">
    <button
      type="button"
      class="cp-section__head"
      :aria-expanded="isOpen"
      :aria-controls="`cp-section-panel-${id}`"
      @click="toggle"
    >
      <span v-if="icon" class="cp-section__icon" aria-hidden="true">{{ icon }}</span>
      <span class="cp-section__text">
        <b>{{ title }}</b>
        <small v-if="subtitle">{{ subtitle }}</small>
      </span>
      <span class="cp-section__chev" aria-hidden="true">{{ isOpen ? '▾' : '▸' }}</span>
    </button>
    <div
      v-show="isOpen"
      :id="`cp-section-panel-${id}`"
      class="cp-section__body"
    >
      <slot />
    </div>
  </section>
</template>
