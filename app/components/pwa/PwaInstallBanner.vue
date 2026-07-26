<script setup lang="ts">
import { BRAND_ICON } from '~/constants/brand'

const { closeBanner, copy, onAction, showBanner, showSteps, visibleSteps } = usePwaInstall()
const { online, queueCount } = useOfflineQueue()

const showOfflineHint = computed(() => !online.value || queueCount.value > 0)
const isInstalledState = computed(() => copy.value.variant === 'installed')
</script>

<template>
  <Transition name="pwa-banner-reveal">
    <div
      v-if="showBanner"
      class="pwa-banner"
      :class="{ 'pwa-banner--installed': isInstalledState }"
      role="region"
      aria-label="Install DORINC app"
    >
      <div class="pwa-banner__card">
        <button
          type="button"
          class="pwa-banner__close"
          aria-label="Close install banner"
          @click="closeBanner"
        >
          ✕
        </button>

        <div class="pwa-banner__icon-wrap" aria-hidden="true">
          <img class="pwa-banner__icon" :src="BRAND_ICON" alt="">
          <span v-if="isInstalledState" class="pwa-banner__check" aria-hidden="true">✓</span>
        </div>

        <div class="pwa-banner__body">
          <p class="pwa-banner__eyebrow">{{ isInstalledState ? 'App status' : 'Quick access' }}</p>
          <strong class="pwa-banner__title">{{ copy.title }}</strong>
          <p class="pwa-banner__message">{{ copy.message }}</p>

          <ol v-if="showSteps && visibleSteps.length" class="pwa-banner__steps">
            <li v-for="(step, index) in visibleSteps" :key="index">{{ step }}</li>
          </ol>

          <p v-if="showOfflineHint" class="pwa-banner__offline">
            <span v-if="!online">You are offline — changes will queue until connection returns.</span>
            <span v-else-if="queueCount > 0">{{ queueCount }} queued action{{ queueCount === 1 ? '' : 's' }} pending sync.</span>
          </p>
        </div>

        <button
          v-if="copy.actionLabel"
          type="button"
          class="pwa-banner__cta"
          @click="onAction"
        >
          {{ copy.actionLabel }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pwa-banner {
  margin: 0 0 14px;
}

.pwa-banner__card {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 14px 40px 14px 16px;
  border-radius: 16px;
  border: 1px solid #c7d2fe;
  background: linear-gradient(135deg, #f8faff 0%, #eef2ff 52%, #f8fafc 100%);
  box-shadow: 0 10px 28px -18px rgba(79, 70, 229, 0.45);
}

.pwa-banner--installed .pwa-banner__card {
  border-color: #bbf7d0;
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 55%, #f8fafc 100%);
  box-shadow: 0 10px 28px -18px rgba(22, 163, 74, 0.25);
}

.pwa-banner__close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.pwa-banner__close:hover {
  background: #fff;
  color: #0f172a;
}

.pwa-banner__icon-wrap {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  display: grid;
  place-items: center;
  box-shadow: 0 4px 14px -8px rgba(15, 23, 42, 0.25);
}

.pwa-banner__icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.pwa-banner__check {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #16a34a;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  display: grid;
  place-items: center;
  border: 2px solid #fff;
}

.pwa-banner__body {
  min-width: 0;
}

.pwa-banner__eyebrow {
  margin: 0 0 2px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6366f1;
}

.pwa-banner--installed .pwa-banner__eyebrow {
  color: #16a34a;
}

.pwa-banner__title {
  display: block;
  margin: 0 0 4px;
  font-size: 0.98rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.pwa-banner__message {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.5;
  color: #475569;
}

.pwa-banner__steps {
  margin: 10px 0 0;
  padding-left: 18px;
  color: #334155;
  font-size: 0.8rem;
  line-height: 1.45;
}

.pwa-banner__steps li + li {
  margin-top: 4px;
}

.pwa-banner__offline {
  margin: 8px 0 0;
  color: #b45309;
  font-size: 0.78rem;
}

.pwa-banner__cta {
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%);
  color: #fff;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 8px 20px -10px rgba(79, 70, 229, 0.9);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.pwa-banner__cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px -12px rgba(79, 70, 229, 0.95);
}

.pwa-banner__cta:active {
  transform: translateY(0);
}

.pwa-banner-reveal-enter-active,
.pwa-banner-reveal-leave-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    max-height 0.35s ease,
    margin 0.35s ease;
  overflow: hidden;
}

.pwa-banner-reveal-enter-from,
.pwa-banner-reveal-leave-to {
  opacity: 0;
  transform: translateY(-8px);
  max-height: 0;
  margin-bottom: 0;
}

.pwa-banner-reveal-enter-to,
.pwa-banner-reveal-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 240px;
  margin-bottom: 14px;
}

@media (max-width: 720px) {
  .pwa-banner__card {
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    padding-right: 16px;
    padding-top: 38px;
  }

  .pwa-banner__close {
    top: 8px;
    right: 8px;
  }

  .pwa-banner__cta {
    grid-column: 1 / -1;
    width: 100%;
  }
}
</style>
