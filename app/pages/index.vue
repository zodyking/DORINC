<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'
import { resolveStaffLandingPath } from '~/utils/staff-route-guard'

// Root router: first-run setup → wizard; signed in → workspace/portal; else login.
// Staff landing uses gate order: announcements → password → return/dashboard.
const { data: setupStatus } = useClientFetch<{ needsBootstrap: boolean }>('/api/setup/status')

if (setupStatus.value?.needsBootstrap) {
  await navigateTo('/setup', { replace: true })
}
else {
  const auth = useAuthStore()
  await auth.fetchMe({ force: true })
  if (!auth.isSignedIn) {
    await navigateTo('/auth/login', { replace: true })
  }
  else if (auth.isCustomer) {
    await navigateTo('/portal', { replace: true })
  }
  else {
    await navigateTo(resolveStaffLandingPath(auth), { replace: true })
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="flex items-center gap-3">
      <img
        class="w-10 h-10 object-contain flex-none"
        :src="BRAND_ICON"
        alt=""
        width="40"
        height="40"
      >
      <div class="text-left">
        <h1 class="font-extrabold text-[17px] tracking-tight leading-tight">
          {{ BRAND_NAME }}
        </h1>
        <p class="text-faint text-xs mt-0.5">
          Loading…
        </p>
      </div>
    </div>
  </div>
</template>
