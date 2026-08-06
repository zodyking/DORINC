<script setup lang="ts">
import AnnouncementGateCard from '~/components/announcements/AnnouncementGateCard.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({ layout: 'staff' })

interface PendingAnnouncement {
  id: string
  title: string
  subtitle: string | null
  bodyHtml: string
  heroImageFileId: string | null
  heroImageUrl: string | null
  ctaButtons: Array<{ label: string, href: string, variant?: 'primary' | 'secondary' | 'ghost' }>
  index: number
  total: number
}

const auth = useAuthStore()
const busy = ref(false)
const error = ref('')
const items = ref<PendingAnnouncement[]>([])

const current = computed(() => items.value[0] ?? null)

const continueLabel = computed(() => {
  if (!current.value) return 'Continue'
  return current.value.total > 1 ? 'Continue' : 'Continue to dashboard'
})

async function loadPending() {
  error.value = ''
  try {
    const res = await $fetch<{ items: PendingAnnouncement[] }>('/api/announcements/pending')
    items.value = res.items
    if (!items.value.length) {
      await auth.fetchMe()
      await navigateTo('/dashboard')
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
    items.value = items.value.slice(1).map((item, index, list) => ({
      ...item,
      index: index + 1,
      total: list.length,
    }))
    if (!items.value.length) {
      await auth.fetchMe()
      if (auth.trainingGate?.locked) {
        const slug = auth.trainingGate.moduleSlug
        await navigateTo(slug ? `/training/learn/${slug}` : '/training')
        return
      }
      await navigateTo('/dashboard')
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
  <div class="ann-gate">
    <div v-if="!current && !error" class="ann-gate-loading">
      Loading required message…
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
      :cta-buttons="current.ctaButtons"
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
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(37, 99, 235, 0.18), transparent 55%),
    radial-gradient(900px 500px at 100% 0%, rgba(14, 116, 144, 0.16), transparent 50%),
    linear-gradient(160deg, #0f172a 0%, #1e293b 45%, #0b1220 100%);
  color: #f8fafc;
  overflow: auto;
}

.ann-gate-loading,
.ann-gate-error {
  text-align: center;
  color: #e2e8f0;
}

.ann-gate-error {
  padding: 24px;
  max-width: 420px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.35);
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
