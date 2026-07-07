<script setup lang="ts">
const route = useRoute()

const nav = [
  { label: 'Dashboard', to: '/portal' },
  { label: 'Invoices', to: '/portal/invoices' },
  { label: 'Vehicles', to: '/portal/vehicles' },
  { label: 'Requests', to: '/portal/requests' },
  { label: 'Account', to: '/portal/account' },
]

function isActive(to: string): boolean {
  if (to === '/portal') return route.path === '/portal'
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <div class="portal-shell">
    <header class="portal-top">
      <div class="brand"><span class="sq">DR</span> DORINC <span class="co">Customer portal</span></div>
      <nav class="portal-nav" aria-label="Portal">
        <NuxtLink v-for="item in nav" :key="item.to" :to="item.to" custom>
          <button :class="{ on: isActive(item.to) }" @click="navigateTo(item.to)">{{ item.label }}</button>
        </NuxtLink>
      </nav>
      <span class="sp" />
      <div class="portal-user">
        <span class="av">CU</span>
        <div><b>Customer</b><small>Customer portal</small></div>
      </div>
      <button class="btn sm" style="margin-left:8px;">Sign out</button>
    </header>

    <slot />

    <footer class="suite-foot">© 2015 DORINC Suite. All rights reserved.</footer>
  </div>
</template>
