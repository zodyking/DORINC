<script setup lang="ts">
import TrainingServiceLogPractice from './TrainingServiceLogPractice.vue'
import TrainingInvoicePractice from './TrainingInvoicePractice.vue'
import TrainingNavigationPractice from './TrainingNavigationPractice.vue'

defineProps<{
  practiceId: string
}>()

const emit = defineEmits<{
  ready: [ready: boolean]
}>()
</script>

<template>
  <TrainingServiceLogPractice
    v-if="practiceId.startsWith('sl-')"
    :practice-id="practiceId"
    @ready="emit('ready', $event)"
  />
  <TrainingInvoicePractice
    v-else-if="practiceId.startsWith('inv-')"
    :practice-id="practiceId"
    @ready="emit('ready', $event)"
  />
  <TrainingNavigationPractice
    v-else-if="practiceId.startsWith('nav-')"
    :practice-id="practiceId"
    @ready="emit('ready', $event)"
  />
  <p v-else class="help">Unknown practice step.</p>
</template>
