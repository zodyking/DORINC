<script setup lang="ts">
import TrainingIcon from './TrainingIcon.vue'
import {
  trainingCategory,
  trainingProgressLabel,
  TRAINING_STATUS_LABELS,
  TRAINING_STATUS_PILLS,
} from '~/utils/training-ui'

defineProps<{
  title: string
  description: string
  category: string
  icon: string
  estimatedMinutes: number
  progressPercent: number
  status?: string | null
  assigned?: boolean
  lessonCount?: number
}>()

defineEmits<{
  start: []
  continue: []
}>()
</script>

<template>
  <article class="training-card">
    <div class="training-card-head">
      <div class="training-card-icon"><TrainingIcon :name="icon" /></div>
      <div>
        <div class="training-card-meta">{{ trainingCategory(category) }} · {{ estimatedMinutes }} min</div>
        <h3>{{ title }}</h3>
      </div>
    </div>
    <p>{{ description }}</p>
    <div v-if="lessonCount" class="help" style="margin:0;">
      {{ lessonCount }} lesson{{ lessonCount === 1 ? '' : 's' }}
    </div>
    <div v-if="assigned" class="training-progress" aria-hidden="true">
      <span :style="{ width: `${Math.min(100, progressPercent)}%` }" />
    </div>
    <div v-if="assigned && status" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <span :class="TRAINING_STATUS_PILLS[status] ?? 'pill gray'">
        {{ TRAINING_STATUS_LABELS[status] ?? status }}
      </span>
      <span class="help" style="margin:0;">{{ trainingProgressLabel(progressPercent) }}</span>
    </div>
    <div class="training-card-actions">
      <slot name="actions">
        <button
          type="button"
          class="btn primary sm"
          @click="$emit(assigned && progressPercent > 0 && progressPercent < 100 ? 'continue' : 'start')"
        >
          {{ progressPercent >= 100 ? 'Review' : progressPercent > 0 ? 'Continue' : 'Start' }}
        </button>
      </slot>
    </div>
  </article>
</template>
