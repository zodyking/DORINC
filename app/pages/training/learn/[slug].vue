<script setup lang="ts">
import type { TrainingLessonStep } from '#shared/training-catalog'
import TrainingLessonPlayer from '~/components/training/TrainingLessonPlayer.vue'

definePageMeta({
  layout: 'staff',
  permission: 'training.complete.own',
})

const route = useRoute()
const auth = useAuthStore()
const slug = computed(() => String(route.params.slug || ''))

interface LessonRow {
  id: string
  slug: string
  title: string
  steps: TrainingLessonStep[]
  sortOrder: number
}

interface ProgressRow {
  lessonId: string
  stepIndex: number
  completedAt: string | null
}

const { data, error, refresh } = useClientFetch<{
  module: { id: string, slug: string, title: string, description: string }
  lessons: LessonRow[]
  assignment: { id: string, status: string } | null
  progress: ProgressRow[]
}>(() => `/api/training/modules/${slug.value}`, { watch: [slug] })

const lessonIndex = ref(0)
const busy = ref(false)
const done = ref(false)

const moduleData = computed(() => data.value?.module)
const lessons = computed(() => data.value?.lessons ?? [])
const assignment = computed(() => data.value?.assignment)
const currentLesson = computed(() => lessons.value[lessonIndex.value])

const progressMap = computed(() => {
  const map = new Map<string, ProgressRow>()
  for (const p of data.value?.progress ?? []) map.set(p.lessonId, p)
  return map
})

const initialStep = computed(() => {
  const lesson = currentLesson.value
  if (!lesson) return 0
  return progressMap.value.get(lesson.id)?.stepIndex ?? 0
})

async function saveProgress(stepIndex: number, completed: boolean) {
  const a = assignment.value
  const lesson = currentLesson.value
  if (!a || !lesson) return
  await $fetch('/api/training/progress', {
    method: 'POST',
    body: {
      assignmentId: a.id,
      lessonId: lesson.id,
      stepIndex,
      completed,
    },
  })
}

async function onStepChange(stepIndex: number) {
  try {
    await saveProgress(stepIndex, false)
  }
  catch { /* best effort */ }
}

async function onLessonComplete() {
  const lesson = currentLesson.value
  if (!lesson) return
  busy.value = true
  try {
    await saveProgress(lesson.steps.length - 1, true)
    if (lessonIndex.value < lessons.value.length - 1) {
      lessonIndex.value += 1
      await refresh()
    }
    else {
      done.value = true
      await auth.fetchMe()
      await refresh()
    }
  }
  finally {
    busy.value = false
  }
}

function goHub() {
  navigateTo('/training')
}
</script>

<template>
  <section class="page active training-learn-page">
    <div v-if="!moduleData && !error" class="cp-state">Loading training…</div>
    <div v-else-if="error" class="cp-state">Could not load this module.</div>

    <template v-else-if="moduleData">
      <div v-if="!assignment" class="card" style="margin-bottom:16px;">
        <div class="cbody">
          <p class="help" style="margin:0 0 10px;">Preview mode — this module is not assigned to you.</p>
          <button type="button" class="btn sm" @click="goHub">Back to training</button>
        </div>
      </div>

      <div v-if="done" class="training-hero">
        <h2>Module complete</h2>
        <p>You finished <strong>{{ moduleData.title }}</strong>. {{ auth.trainingGate?.locked ? 'Refreshing access…' : 'Great work!' }}</p>
        <button type="button" class="btn primary" style="margin-top:12px;" @click="goHub">
          Back to training
        </button>
      </div>

      <div v-else-if="currentLesson" class="training-learn-wrap">
        <TrainingLessonPlayer
          :module-title="moduleData.title"
          :lesson-title="currentLesson.title"
          :steps="currentLesson.steps"
          :initial-step="initialStep"
          :busy="busy"
          @step-change="onStepChange"
          @complete="onLessonComplete"
        />
      </div>

      <div v-if="lessons.length > 1 && !done" class="help" style="text-align:center;margin-top:12px;">
        Lesson {{ lessonIndex + 1 }} of {{ lessons.length }}
      </div>
    </template>
  </section>
</template>
