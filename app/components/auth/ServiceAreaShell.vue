<script setup lang="ts">
import { BRAND_ICON } from '~/constants/brand'

defineProps<{
  titleLead?: string
  titleAccent?: string
  notice?: string
}>()
</script>

<template>
  <main id="main-content" class="sa-screen">
    <div class="sa-wire" aria-hidden="true" />
    <div class="sa-content">
      <div class="sa-brand">
        <img class="sa-icon" :src="BRAND_ICON" alt="" width="72" height="72">
        <div class="sa-wordmark" aria-label="Dorinc Suite">
          <span class="sa-wordmark__name">Dorinc</span>
          <span class="sa-wordmark__suite">Suite</span>
        </div>
      </div>

      <div class="sa-rule" role="separator">
        <span>{{ notice || 'NOTICE' }}</span>
      </div>

      <h1 class="sa-title">
        <span class="sa-title__lead">{{ titleLead || 'Service Area' }}</span>
        <span class="sa-title__accent">{{ titleAccent || 'Restriction' }}</span>
      </h1>

      <div class="sa-rule sa-rule--icon" role="separator">
        <span class="sa-shield" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path
              d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"
              stroke="currentColor"
              stroke-width="1.6"
              fill="rgba(37,99,235,.08)"
            />
            <path
              d="M9.2 12.2l1.8 1.8 3.8-3.8"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </div>

      <div class="sa-body">
        <slot />
      </div>
    </div>

    <div class="sa-geo" aria-hidden="true">
      <svg class="sa-geo__svg" viewBox="0 0 800 280" preserveAspectRatio="none">
        <polygon points="0,180 160,40 320,200 0,280" fill="#1e3a8a" />
        <polygon points="120,280 300,60 480,220 240,280" fill="#1d4ed8" />
        <polygon points="280,280 460,30 680,190 420,280" fill="#2563eb" />
        <polygon points="420,280 580,70 800,160 800,280" fill="#0ea5e9" />
        <polygon points="520,280 700,90 800,40 800,280" fill="#0369a1" />
        <polygon points="0,220 220,100 360,240 0,280" fill="#172554" opacity=".85" />
        <polygon points="200,280 380,120 560,250 320,280" fill="#38bdf8" opacity=".9" />
      </svg>
    </div>
  </main>
</template>

<style scoped>
.sa-screen {
  --sa-ink: #0f172a;
  --sa-muted: #64748b;
  --sa-blue: #2563eb;
  --sa-line: #cbd5e1;
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px 160px;
  overflow: hidden;
  background: #f8fafc;
  color: var(--sa-ink);
  font-family: "Inter", system-ui, sans-serif;
  text-align: center;
}

.sa-wire {
  position: absolute;
  inset: 0 0 35%;
  background:
    linear-gradient(135deg, transparent 48%, rgba(147, 197, 253, 0.28) 49%, transparent 51%),
    linear-gradient(45deg, transparent 48%, rgba(191, 219, 254, 0.22) 49%, transparent 51%),
    linear-gradient(180deg, #ffffff 0%, #f8fafc 70%, transparent 100%);
  background-size: 180px 180px, 220px 220px, auto;
  pointer-events: none;
}

.sa-content {
  position: relative;
  z-index: 1;
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
}

.sa-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.sa-icon {
  width: 72px;
  height: 72px;
  object-fit: contain;
  border-radius: 16px;
}

.sa-wordmark {
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  line-height: 1;
}

.sa-wordmark__name {
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.sa-wordmark__suite {
  font-size: 1.55rem;
  font-weight: 500;
  color: #94a3b8;
}

.sa-rule {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  color: #94a3b8;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.22em;
}

.sa-rule::before,
.sa-rule::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--sa-line);
}

.sa-rule--icon {
  letter-spacing: 0;
}

.sa-shield {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  color: #3b82f6;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.sa-title {
  margin: 0;
  display: grid;
  gap: 2px;
  font-size: clamp(1.85rem, 5vw, 2.25rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.sa-title__lead { color: #0f172a; }
.sa-title__accent { color: var(--sa-blue); }

.sa-body {
  width: 100%;
  display: grid;
  gap: 18px;
  color: var(--sa-muted);
  font-size: 1.02rem;
  line-height: 1.55;
  font-weight: 500;
}

.sa-geo {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: min(34vh, 280px);
  z-index: 0;
  pointer-events: none;
}

.sa-geo__svg {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
