<script setup lang="ts">
definePageMeta({
  layout: false,
  // Static notice page — no client data fetches / no scoping requests.
  ssr: true,
})
</script>

<template>
  <AuthServiceAreaShell title-lead="Service Area" title-accent="Restriction">
    <p>
      You're trying to access Dorinc Suite<br>
      outside of our service area.<br>
      Sorry for the inconvenience.<br>
      Please contact an administrator<br>
      for assistance.
    </p>
    <p class="sa-hint">
      On cellular, sign in so we can use this device's location.
    </p>
    <NuxtLink to="/auth/login?card=staff" class="sa-btn">
      Sign in
    </NuxtLink>
  </AuthServiceAreaShell>
</template>

<style scoped>
:deep(.sa-screen) {
  justify-content: flex-start;
  padding-top: 28px;
  padding-bottom: 240px;
}
:deep(.sa-content) {
  gap: 12px;
}
:deep(.sa-geo) {
  height: min(26vh, 190px);
}
.sa-hint {
  margin: 0;
  font-size: 0.92rem;
  color: #475569;
}
.sa-btn {
  display: inline-block;
  appearance: none;
  border: 0;
  border-radius: 12px;
  padding: 13px 28px;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  text-decoration: none;
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  cursor: pointer;
  box-shadow: 0 10px 20px -12px rgba(37, 99, 235, 0.8);
  justify-self: center;
  min-width: 160px;
  position: relative;
  z-index: 1;
}
.sa-btn:hover { filter: brightness(1.03); }
.sa-btn:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
</style>
