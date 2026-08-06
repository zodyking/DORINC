<script setup lang="ts">
import { sanitizeAnnouncementHtml } from '#shared/announcement-html'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string | null
  bodyHtml?: string
  heroImageUrl?: string | null
  index?: number
  total?: number
  continueLabel?: string
  continueBusy?: boolean
  continueDisabled?: boolean
  error?: string
  compact?: boolean
}>(), {
  subtitle: null,
  bodyHtml: '',
  heroImageUrl: null,
  index: 1,
  total: 1,
  continueLabel: 'Continue to dashboard',
  continueBusy: false,
  continueDisabled: false,
  error: '',
  compact: false,
})

const emit = defineEmits<{
  continue: []
}>()

const safeBody = computed(() => sanitizeAnnouncementHtml(props.bodyHtml || ''))
</script>

<template>
  <article class="ann-gate-card" :class="{ compact }">
    <header class="ann-gate-meta">
      <span class="ann-gate-count">
        Message {{ index }} of {{ total }}
      </span>
    </header>

    <div v-if="heroImageUrl" class="ann-gate-hero">
      <img :src="heroImageUrl" :alt="title || 'Message image'">
    </div>

    <div class="ann-gate-content">
      <h1>{{ title || 'Untitled message' }}</h1>
      <p v-if="subtitle" class="ann-gate-subtitle">{{ subtitle }}</p>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="safeBody" class="ann-gate-body" v-html="safeBody" />
      <p v-else class="ann-gate-empty">Message body goes here…</p>

    </div>

    <footer class="ann-gate-foot">
      <p v-if="error" class="help ann-gate-error">{{ error }}</p>
      <button
        type="button"
        class="btn primary ann-gate-continue"
        :disabled="continueDisabled || continueBusy"
        data-testid="announcement-continue"
        @click="emit('continue')"
      >
        {{ continueBusy ? 'Continuing…' : continueLabel }}
      </button>
      <p class="ann-gate-hint">
        Continue through {{ total === 1 ? 'this message' : 'all messages' }} to use the workspace. Active messages return on each login while scheduled.
      </p>
    </footer>
  </article>
</template>

<style scoped>
.ann-gate-card {
  width: min(820px, 100%);
  max-height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 16px 40px -16px rgba(15, 23, 42, 0.18);
}

.ann-gate-card.compact {
  width: min(520px, 100%);
  max-height: none;
  border-radius: 16px;
  box-shadow: 0 16px 40px -16px rgba(15, 23, 42, 0.15);
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
  max-height: 320px;
  overflow: hidden;
  /* Light fill so letterboxing matches typical banner art (not a dark crop). */
  background: #e8f1fb;
}

.ann-gate-card.compact .ann-gate-hero {
  max-height: 180px;
}

/* contain + top: never crop titles baked into hero artwork */
.ann-gate-hero img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 320px;
  object-fit: contain;
  object-position: top center;
}

.ann-gate-card.compact .ann-gate-hero img {
  max-height: 180px;
}

.ann-gate-content {
  padding: 22px 28px 8px;
  overflow: auto;
  flex: 1;
}

.ann-gate-card.compact .ann-gate-content {
  padding: 16px 18px 6px;
}

.ann-gate-content h1 {
  margin: 0 0 8px;
  font-size: clamp(1.45rem, 2.2vw, 2.05rem);
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.ann-gate-card.compact .ann-gate-content h1 {
  font-size: 1.35rem;
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

.ann-gate-empty {
  margin: 0;
  color: #94a3b8;
  font-style: italic;
}

.ann-gate-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 10px;
}

.ann-gate-body :deep(a) {
  color: #1d4ed8;
}

.ann-gate-foot {
  padding: 16px 28px 24px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}

.ann-gate-card.compact .ann-gate-foot {
  padding: 12px 18px 16px;
}

.ann-gate-continue {
  width: 100%;
  min-height: 48px;
  font-size: 1.05rem;
}

.ann-gate-card.compact .ann-gate-continue {
  min-height: 42px;
  font-size: 0.95rem;
}

.ann-gate-hint {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: #64748b;
}

.ann-gate-error {
  color: #dc2626;
  margin: 0 0 8px;
}
</style>
