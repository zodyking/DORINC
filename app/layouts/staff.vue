<script setup lang="ts">
const route = useRoute()

const sidebarOpen = ref(false)
const menuOpen = ref(false)
const notifOpen = ref(false)

interface NavItem {
  label: string
  to: string
  ico: string
  count?: number
}

interface NavSection {
  label: string
  items: NavItem[]
}

// Counts become live once list APIs land (Phase 1)
const nav = computed<NavSection[]>(() => [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', to: '/dashboard', ico: '▫' },
      { label: 'Invoices', to: '/invoices', ico: '▤' },
      { label: 'Customers', to: '/customers', ico: '◉' },
      { label: 'Vehicles', to: '/vehicles', ico: '⛟' },
      { label: 'Service Logs', to: '/service-logs', ico: '✎' },
      { label: 'Catalog', to: '/catalog', ico: '▦' },
    ],
  },
  {
    label: 'Billing tools',
    items: [
      { label: 'New Invoice', to: '/invoices/new', ico: '✚' },
      { label: 'Template Designer', to: '/templates/designer', ico: '◨' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Users', to: '/users', ico: '👥' },
      { label: 'System Logs', to: '/system-logs', ico: '▣' },
    ],
  },
  {
    label: 'Super Admin',
    items: [
      { label: 'Control Panel', to: '/admin', ico: '🛡' },
    ],
  },
])

const crumb = computed(() => {
  for (const section of nav.value) {
    const hit = section.items.find(i => isActive(i.to))
    if (hit) return hit.label
  }
  return 'Dashboard'
})

function isActive(to: string): boolean {
  if (to === '/invoices') {
    return route.path === '/invoices' || (route.path.startsWith('/invoices/') && route.path !== '/invoices/new')
  }
  return route.path === to || route.path.startsWith(`${to}/`)
}

function closeOverlays() {
  menuOpen.value = false
  notifOpen.value = false
}

watch(() => route.path, () => {
  sidebarOpen.value = false
  closeOverlays()
})
</script>

<template>
  <div class="app">
    <!-- SIDEBAR -->
    <nav class="side" :class="{ open: sidebarOpen }" aria-label="Primary">
      <div class="logo"><span class="sq">DR</span> DORINC Suite</div>
      <template v-for="section in nav" :key="section.label">
        <div class="label">{{ section.label }}</div>
        <NuxtLink
          v-for="item in section.items"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ on: isActive(item.to) }"
        >
          <span class="ico">{{ item.ico }}</span> {{ item.label }}
          <span v-if="item.count" class="cnt">{{ item.count }}</span>
        </NuxtLink>
      </template>
    </nav>
    <button
      class="scrim"
      :class="{ show: sidebarOpen }"
      aria-label="Close menu"
      tabindex="-1"
      @click="sidebarOpen = false"
    />

    <div class="main">
      <!-- TOPBAR -->
      <header class="topbar">
        <button class="burger" aria-label="Open navigation" @click="sidebarOpen = !sidebarOpen">☰</button>
        <span class="crumb">Workspace / <b>{{ crumb }}</b></span>
        <span class="spacer" />
        <div class="notif-wrap">
          <button
            class="iconbtn"
            aria-label="Notifications"
            :aria-expanded="notifOpen"
            @click="notifOpen = !notifOpen; menuOpen = false"
          >
            🔔
          </button>
          <div class="notif-panel" :class="{ open: notifOpen }">
            <div class="nh">Notifications</div>
            <div class="ni"><b>No notifications yet</b><span>You're all caught up.</span></div>
          </div>
        </div>
        <div class="acct">
          <button
            class="avbtn"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen; notifOpen = false"
          >
            <span class="av indigo">DR</span>
            <span class="who"><b>Staff</b><small>DORINC</small></span>
            <span class="car">▾</span>
          </button>
          <div class="menu" :class="{ open: menuOpen }" role="menu">
            <div class="mhead">
              <b>Staff</b>
              <small>Signed in</small>
            </div>
            <NuxtLink to="/account" class="menu-link" @click="closeOverlays">
              <button>👤 &nbsp;My account</button>
            </NuxtLink>
            <NuxtLink to="/admin" class="menu-link" @click="closeOverlays">
              <button>🛡 &nbsp;Control panel</button>
            </NuxtLink>
            <hr>
            <button class="danger">⏻ &nbsp;Sign out</button>
          </div>
        </div>
      </header>

      <slot />
    </div>
  </div>
</template>

<style scoped>
.menu-link {
  text-decoration: none;
}
</style>
