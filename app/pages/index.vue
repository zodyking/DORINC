<script setup lang="ts">
// Root router: first-run setup → wizard; signed in → workspace/portal; else login.
const { data: setupStatus } = await useFetch<{ needsBootstrap: boolean }>('/api/setup/status')

if (setupStatus.value?.needsBootstrap) {
  await navigateTo('/setup', { replace: true })
}
else {
  const auth = useAuthStore()
  await auth.fetchMe()
  if (!auth.isSignedIn) {
    await navigateTo('/auth/login', { replace: true })
  }
  else {
    await navigateTo(auth.isCustomer ? '/portal' : '/dashboard', { replace: true })
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <div class="inline-grid place-items-center w-11 h-11 rounded-xl bg-accent text-white font-extrabold mb-2.5">
        DR
      </div>
      <h1 class="font-extrabold text-[17px] tracking-tight">
        DORINC Suite
      </h1>
      <p class="text-faint text-xs mt-0.5">
        Loading…
      </p>
    </div>
  </div>
</template>
