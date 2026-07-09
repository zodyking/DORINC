<script setup lang="ts">
const route = useRoute()
const auth = useAuthStore()

const nav = [
  { label: 'Dashboard', to: '/portal' },
  { label: 'Invoices', to: '/portal/invoices' },
  { label: 'Estimates', to: '/portal/estimates' },
  { label: 'Vehicles', to: '/portal/vehicles' },
  { label: 'Requests', to: '/portal/requests' },
  { label: 'Account', to: '/portal/account' },
]

function isActive(to: string): boolean {
  if (to === '/portal') return route.path === '/portal'
  return route.path === to || route.path.startsWith(`${to}/`)
}

const initials = computed(() => {
  const name = auth.user?.name ?? 'Customer'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'CU'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
})

async function signOut() {
  await auth.logout()
}
</script>

<template>
  <div class="portal-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="portal-top">
      <div class="brand"><span class="sq">DR</span> DORINC <span class="co">Customer portal</span></div>
      <nav class="portal-nav" aria-label="Portal">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          :class="{ on: isActive(item.to) }"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
      <span class="sp" />
      <div class="portal-user">
        <span class="av">{{ initials }}</span>
        <div><b>{{ auth.user?.name ?? 'Customer' }}</b><small>Customer portal</small></div>
      </div>
      <button class="btn sm" style="margin-left:8px;" @click="signOut">Sign out</button>
    </header>

    <div class="pwa-banner-wrap">
      <PwaInstallBanner />
    </div>

    <main id="main-content" class="portal-main">
      <slot />
    </main>

    <footer class="suite-foot">© 2015 DORINC Suite. All rights reserved.</footer>
  </div>
</template>

<style scoped>
.pwa-banner-wrap {
  padding: 12px 28px 0;
}
@media (max-width: 720px) {
  .pwa-banner-wrap {
    padding: 12px 16px 0;
  }
}
</style>
