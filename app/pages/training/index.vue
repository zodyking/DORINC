<script setup lang="ts">
import TrainingModuleCard from '~/components/training/TrainingModuleCard.vue'
import { armTrainingSpeechFromClick } from '~/utils/training-speech'

definePageMeta({
  layout: 'staff',
  permission: ['training.complete.own', 'training.read.all'],
})

const auth = useAuthStore()
const canManage = computed(() => auth.can('training.manage.all'))

const { data: myData } = useClientFetch<{ items: Array<{
  id: string
  status: string
  progressPercent: number
  locksAccess: boolean
  module: {
    id: string
    slug: string
    title: string
    description: string
    category: string
    icon: string
    estimatedMinutes: number
  }
  totalLessons: number
}> }>('/api/training/my')

const { data: catalogData } = useClientFetch<{ items: Array<{
  id: string
  slug: string
  title: string
  description: string
  category: string
  icon: string
  estimatedMinutes: number
  lessonCount: number
}> }>('/api/training/modules')

const tab = ref<'my' | 'library'>('my')
const gateLocked = computed(() => auth.trainingGate?.locked ?? false)

const myAssignments = computed(() => myData.value?.items ?? [])
const pendingAssignments = computed(() => myAssignments.value.filter(a => a.status !== 'completed'))
const catalog = computed(() => catalogData.value?.items ?? [])

/** Real progress per module so the library reflects what you have actually done. */
const assignmentByModuleId = computed(() => {
  const map = new Map<string, { status: string, progressPercent: number }>()
  for (const a of myAssignments.value) {
    map.set(a.module.id, { status: a.status, progressPercent: a.progressPercent })
  }
  return map
})

function openModule(slug: string) {
  armTrainingSpeechFromClick()
  navigateTo(`/training/learn/${slug}`)
}
</script>

<template>
  <section class="page active training-shell">
    <StaffPageHead subtitle="Short, hands-on courses that walk you through the real interface.">
      <template #title>Training</template>
    </StaffPageHead>

    <div v-if="gateLocked" class="training-lock-banner">
      Complete required training to unlock the rest of the app.
    </div>

    <div v-if="pendingAssignments.length" class="training-hero" :class="{ locked: gateLocked }">
      <h2>{{ gateLocked ? 'Required training' : 'Your assignments' }}</h2>
      <p>
        {{ pendingAssignments.length }} module{{ pendingAssignments.length === 1 ? '' : 's' }} waiting.
        {{ gateLocked ? 'Finish the locked module below to continue.' : 'Pick up where you left off.' }}
      </p>
    </div>

    <div class="wizbar" style="margin-bottom:4px;">
      <button type="button" class="btn sm" :class="{ primary: tab === 'my' }" @click="tab = 'my'">My training</button>
      <button type="button" class="btn sm" :class="{ primary: tab === 'library' }" @click="tab = 'library'">All courses</button>
    </div>

    <div v-if="tab === 'my'">
      <div v-if="myAssignments.length" class="training-grid">
        <TrainingModuleCard
          v-for="row in myAssignments"
          :key="row.id"
          :title="row.module.title"
          :description="row.module.description"
          :category="row.module.category"
          :icon="row.module.icon"
          :estimated-minutes="row.module.estimatedMinutes"
          :progress-percent="row.progressPercent"
          :status="row.status"
          :assigned="true"
          :lesson-count="row.totalLessons"
          @start="openModule(row.module.slug)"
          @continue="openModule(row.module.slug)"
        />
      </div>
      <div v-else class="cp-state">
        Nothing assigned to you yet — open <b>All courses</b> to start any course on your own.
      </div>
    </div>

    <div v-else>
      <p class="help" style="margin:0 0 14px;">
        {{ canManage
          ? 'Every course, open to all staff. Assign one to a user from their profile to make it required.'
          : 'Every course is open — work through any of them whenever you want.' }}
      </p>
      <div class="training-grid">
        <TrainingModuleCard
          v-for="mod in catalog"
          :key="mod.id"
          :title="mod.title"
          :description="mod.description"
          :category="mod.category"
          :icon="mod.icon"
          :estimated-minutes="mod.estimatedMinutes"
          :progress-percent="assignmentByModuleId.get(mod.id)?.progressPercent ?? 0"
          :status="assignmentByModuleId.get(mod.id)?.status ?? null"
          :assigned="assignmentByModuleId.has(mod.id)"
          :lesson-count="mod.lessonCount"
          @start="openModule(mod.slug)"
          @continue="openModule(mod.slug)"
        />
      </div>
    </div>
  </section>
</template>
