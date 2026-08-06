<script setup lang="ts">
import { sanitizeAnnouncementHtml } from '#shared/announcement-html'

export interface GateCardButton {
  label: string
  href: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string | null
  bodyHtml?: string
  heroImageUrl?: string | null
  ctaButtons?: GateCardButton[]
  index?: number
  total?: number
  continueLabel?: string
  continueBusy?: boolean
  continueDisabled?: boolean
  error?: string
  interactiveCtas?: boolean
  compact?: boolean
}>(), {
  subtitle: null,
  bodyHtml: '',
  heroImageUrl: null,
  ctaButtons: () => [],
  index: 1,
  total: 1,
  continueLabel: 'Continue to dashboard',
  continueBusy: false,
  continueDisabled: false,
  error: '',
  interactiveCtas: true,
  compact: false,
})

const emit = defineEmits<{
  continue: []
}>()

const safeBody = computed(() => sanitizeAnnouncementHtml(props.bodyHtml || ''))
const visibleCtas = computed(() =>
  (props.ctaButtons ?? []).filter(b => b.label.trim() && b.href.trim()),
)
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

      <div v-if="visibleCtas.length" class="ann-gate-ctas">
        <component
          :is="interactiveCtas ? 'a' : 'span'"
          v-for="(btn, i) in visibleCtas"
          :key="`${btn.href}-${i}`"
          class="btn"
          :class="btn.variant === 'primary' ? 'primary' : btn.variant === 'ghost' ? 'ghost' : ''"
          :href="interactiveCtas ? btn.href : undefined"
          :target="interactiveCtas && btn.href.startsWith('http') ? '_blank' : undefined"
          :rel="interactiveCtas && btn.href.startsWith('http') ? 'noopener noreferrer' : undefined"
        >
          {{ btn.label }}
        </component>
      </div>
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
        You must continue through {{ total === 1 ? 'this message' : 'all messages' }} before using the workspace.
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
  max-height: 280px;
  overflow: hidden;
  background: #0f172a;
}

.ann-gate-card.compact .ann-gate-hero {
  max-height: 160px;
}

.ann-gate-hero img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 280px;
  object-fit: cover;
}

.ann-gate-card.compact .ann-gate-hero img {
  max-height: 160px;
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
