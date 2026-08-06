<script setup lang="ts">
import { sanitizeAnnouncementHtml } from '#shared/announcement-html'
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

const safeBody = computed(() =>
  current.value ? sanitizeAnnouncementHtml(current.value.bodyHtml) : '',
)

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

    <article v-else-if="current" class="ann-gate-card">
      <header class="ann-gate-meta">
        <span class="ann-gate-count">
          Message {{ current.index }} of {{ current.total }}
        </span>
      </header>

      <div
        v-if="current.heroImageUrl"
        class="ann-gate-hero"
      >
        <img :src="current.heroImageUrl" :alt="current.title" >
      </div>

      <div class="ann-gate-content">
        <h1>{{ current.title }}</h1>
        <p v-if="current.subtitle" class="ann-gate-subtitle">{{ current.subtitle }}</p>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="ann-gate-body" v-html="safeBody" />

        <div v-if="current.ctaButtons.length" class="ann-gate-ctas">
          <a
            v-for="(btn, i) in current.ctaButtons"
            :key="`${btn.href}-${i}`"
            class="btn"
            :class="btn.variant === 'primary' ? 'primary' : btn.variant === 'ghost' ? 'ghost' : ''"
            :href="btn.href"
            :target="btn.href.startsWith('http') ? '_blank' : undefined"
            :rel="btn.href.startsWith('http') ? 'noopener noreferrer' : undefined"
          >
            {{ btn.label }}
          </a>
        </div>
      </div>

      <footer class="ann-gate-foot">
        <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
        <button
          type="button"
          class="btn primary ann-gate-continue"
          :disabled="busy"
          data-testid="announcement-continue"
          @click="continueMessage"
        >
          {{ busy ? 'Continuing…' : current.total > 1 ? 'Continue' : 'Continue to dashboard' }}
        </button>
        <p class="ann-gate-hint">
          You must continue through {{ current.total === 1 ? 'this message' : 'all messages' }} before using the workspace.
        </p>
      </footer>
    </article>
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

.ann-gate-card {
  width: min(820px, 100%);
  max-height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
  background: rgba(248, 250, 252, 0.98);
  color: #0f172a;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
}

.ann-gate-meta {
  display: flex;
  justify-content: flex-end;
  padding: 14px 18px 0;
}

.ann-gate-count {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #475569;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 6px 10px;
}

.ann-gate-hero {
  margin-top: 12px;
  width: 100%;
  max-height: 280px;
  overflow: hidden;
  background: #0f172a;
}

.ann-gate-hero img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 280px;
  object-fit: cover;
}

.ann-gate-content {
  padding: 22px 28px 8px;
  overflow: auto;
  flex: 1;
}

.ann-gate-content h1 {
  margin: 0 0 8px;
  font-size: clamp(1.6rem, 2.4vw, 2.15rem);
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.ann-gate-subtitle {
  margin: 0 0 16px;
  color: #475569;
  font-size: 1.05rem;
}

.ann-gate-body {
  font-size: 1rem;
  line-height: 1.55;
  color: #1e293b;
}

.ann-gate-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 10px;
}

.ann-gate-body :deep(a) {
  color: #1d4ed8;
}

.ann-gate-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.ann-gate-foot {
  padding: 16px 28px 24px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}

.ann-gate-continue {
  width: 100%;
  min-height: 48px;
  font-size: 1.05rem;
}

.ann-gate-hint {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: #64748b;
}

@media (max-width: 640px) {
  .ann-gate {
    padding: 0;
    align-items: stretch;
  }

  .ann-gate-card {
    width: 100%;
    max-height: none;
    min-height: 100dvh;
    border-radius: 0;
  }

  .ann-gate-content {
    padding: 18px 18px 8px;
  }

  .ann-gate-foot {
    padding: 14px 18px 20px;
  }
}
</style>
