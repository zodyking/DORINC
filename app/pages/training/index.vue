<script setup lang="ts">
import TrainingModuleCard from '~/components/training/TrainingModuleCard.vue'
import { isTrainingPath } from '~/utils/training-ui'

definePageMeta({
  layout: 'staff',
  permission: ['training.complete.own', 'training.read.all'],
})

const auth = useAuthStore()
const route = useRoute()
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

const tab = ref<'my' | 'library' | 'assignments'>('my')
const gateLocked = computed(() => auth.trainingGate?.locked ?? false)

const myAssignments = computed(() => myData.value?.items ?? [])
const pendingAssignments = computed(() => myAssignments.value.filter(a => a.status !== 'completed'))
const catalog = computed(() => catalogData.value?.items ?? [])

const assignedModuleIds = computed(() => new Set(myAssignments.value.map(a => a.module.id)))

function openModule(slug: string) {
  navigateTo(`/training/learn/${slug}`)
}

onMounted(() => {
  if (gateLocked.value && !isTrainingPath(route.path)) {
    const slug = auth.trainingGate?.moduleSlug
    if (slug) navigateTo(`/training/learn/${slug}`)
  }
})
</script>

<template>
  <section class="page active training-shell">
    <StaffPageHead subtitle="Interactive tutorials assigned by your admin.">
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

    <div v-if="canManage" class="wizbar" style="margin-bottom:4px;">
      <button type="button" class="btn sm" :class="{ primary: tab === 'my' }" @click="tab = 'my'">My training</button>
      <button type="button" class="btn sm" :class="{ primary: tab === 'library' }" @click="tab = 'library'">Module library</button>
    </div>

    <div v-if="tab === 'my' || !canManage">
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
        No training assigned yet. Your administrator can assign modules from your user profile.
      </div>
    </div>

    <div v-else-if="tab === 'library' && canManage">
      <p class="help" style="margin:0 0 14px;">
        Modules are shared across account types. Assign them per user from the Users page or below.
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
          :progress-percent="assignedModuleIds.has(mod.id) ? 50 : 0"
          :assigned="assignedModuleIds.has(mod.id)"
          :lesson-count="mod.lessonCount"
          @start="openModule(mod.slug)"
        />
      </div>
    </div>
  </section>
</template>
