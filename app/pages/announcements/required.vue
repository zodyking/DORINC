<script setup lang="ts">
import AnnouncementGateCard from '~/components/announcements/AnnouncementGateCard.vue'
import { advanceAnnouncementQueue } from '~/utils/announcement-gate-queue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { resolveNextStaffPath } from '~/utils/staff-route-guard'

// Full-screen gate only — never mount the staff shell / dashboard chrome.
definePageMeta({ layout: false })

interface PendingAnnouncement {
  id: string
  title: string
  subtitle: string | null
  bodyHtml: string
  heroImageFileId: string | null
  heroImageUrl: string | null
  index: number
  total: number
}

const auth = useAuthStore()
const route = useRoute()
const busy = ref(false)
const error = ref('')
const items = ref<PendingAnnouncement[]>([])
const advancing = ref(false)

const current = computed(() => items.value[0] ?? null)

const continueLabel = computed(() => {
  if (!current.value) return 'Continue'
  return current.value.index < current.value.total ? 'Continue' : 'Continue to dashboard'
})

async function leaveAnnouncementGate() {
  if (advancing.value) return
  advancing.value = true
  try {
    await auth.fetchMe({ force: true })
    // Pending list is authoritative when empty — clear a stale lock before routing.
    if (auth.announcementGate?.locked) {
      auth.announcementGate = {
        locked: false,
        pendingCount: 0,
        currentId: null,
      }
    }
    const next = resolveNextStaffPath(auth, {
      leaving: 'announcement',
      fromPath: route.path,
    })
    await navigateTo(next)
  }
  finally {
    advancing.value = false
  }
}

async function loadPending() {
  error.value = ''
  try {
    const res = await $fetch<{ items: PendingAnnouncement[] }>('/api/announcements/pending')
    items.value = res.items ?? []
    if (!items.value.length) {
      await leaveAnnouncementGate()
    }
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not load required messages')
  }
}

async function continueMessage() {
  if (!current.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ gate: { locked: boolean, pendingCount: number, currentId: string | null } }>(
      `/api/announcements/${current.value.id}/acknowledge`,
      { method: 'POST' },
    )
    auth.announcementGate = res.gate
    items.value = advanceAnnouncementQueue(items.value)
    if (!items.value.length) {
      await leaveAnnouncementGate()
      return
    }
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not continue')
    await loadPending()
  }
  finally {
    busy.value = false
  }
}

onMounted(() => {
  void loadPending()
})
</script>

<template>
  <div class="ann-gate ann-login-bg">
    <div v-if="(!current && !error) || advancing" class="ann-gate-loading">
      {{ advancing ? 'Continuing…' : 'Loading required message…' }}
    </div>

    <div v-else-if="error && !current" class="ann-gate-error card">
      <p>{{ error }}</p>
      <button type="button" class="btn primary" @click="loadPending">Retry</button>
    </div>

    <AnnouncementGateCard
      v-else-if="current"
      :title="current.title"
      :subtitle="current.subtitle"
      :body-html="current.bodyHtml"
      :hero-image-url="current.heroImageUrl"
      :index="current.index"
      :total="current.total"
      :continue-label="continueLabel"
      :continue-busy="busy"
      :error="error"
      @continue="continueMessage"
    />
  </div>
</template>

<style scoped>
.ann-gate {
  position: fixed;
  inset: 0;
  z-index: 80;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  overflow: auto;
}

.ann-gate-loading,
.ann-gate-error {
  text-align: center;
  color: #0f172a;
}

.ann-gate-error {
  padding: 24px;
  max-width: 420px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #e2e8f0;
  box-shadow: 0 16px 40px -16px rgba(15, 23, 42, 0.18);
}

@media (max-width: 640px) {
  .ann-gate {
    padding: 0;
    align-items: stretch;
  }

  .ann-gate :deep(.ann-gate-card) {
    width: 100%;
    max-height: none;
    min-height: 100dvh;
    border-radius: 0;
  }
}
</style>
