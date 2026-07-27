<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'

definePageMeta({ layout: false })

const route = useRoute()

const REASON_COPY: Record<string, string> = {
  ip_banned: 'This network has been blocked by an administrator.',
  geo_outside_allowed: 'This site is only available from approved locations.',
  geo_inside_blocked: 'This site is not available from your current location.',
  geo_unknown: 'We could not confirm your location, and this site requires a confirmed location.',
}

const reason = computed(() => String(route.query.reason ?? 'blocked'))
const detail = computed(() => REASON_COPY[reason.value] ?? 'Access to this site is restricted from your location.')

useHead({ title: `Access restricted · ${BRAND_NAME}` })
</script>

<template>
  <main class="denied">
    <section class="denied__card" role="alert" aria-labelledby="denied-title">
      <img
        class="denied__logo"
        :src="BRAND_ICON"
        alt=""
        width="44"
        height="44"
      >
      <h1 id="denied-title" class="denied__title">
        Access restricted
      </h1>
      <p class="denied__detail">
        {{ detail }}
      </p>
      <p class="denied__hint">
        If you believe this is a mistake, contact your administrator and quote the reference below.
      </p>
      <p class="denied__ref">
        {{ reason }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.denied {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #f8fafc;
}
.denied__card {
  width: 100%;
  max-width: 460px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 32px 28px;
  text-align: center;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}
.denied__logo { width: 44px; height: 44px; object-fit: contain; margin: 0 auto 16px; }
.denied__title { margin: 0 0 10px; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em; }
.denied__detail { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155; }
.denied__hint { margin: 0 0 12px; font-size: 13px; line-height: 1.6; color: #64748b; }
.denied__ref {
  margin: 0;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 12px;
  color: #94a3b8;
}
@media (max-width: 480px) {
  .denied__card { padding: 26px 20px; }
  .denied__title { font-size: 20px; }
}
</style>
