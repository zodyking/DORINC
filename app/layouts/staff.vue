<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'
import { accountTypeLabel, avColor, initials } from '~/utils/users-ui'
import { useDetectionSettings } from '~/composables/useDetectionSettings'

import type { PermissionKey } from '~/shared/permissions/keys'

const route = useRoute()
const auth = useAuthStore()
const { load: loadDetectionSettings } = useDetectionSettings()

onMounted(() => {
  if (auth.user) void loadDetectionSettings()
})

watch(() => auth.user, (user) => {
  if (user) void loadDetectionSettings()
})

const sidebarOpen = ref(false)
const menuOpen = ref(false)
const notifOpen = ref(false)

interface NavItem {
  label: string
  to: string
  ico: string
  count?: number
  permission?: PermissionKey | PermissionKey[]
}

interface NavSection {
  label: string
  items: NavItem[]
}

function canNav(item: NavItem): boolean {
  if (!item.permission) return true
  const keys = Array.isArray(item.permission) ? item.permission : [item.permission]
  return keys.some(key => auth.can(key))
}

function filterSection(section: NavSection): NavSection | null {
  const items = section.items.filter(canNav)
  if (!items.length) return null
  return { ...section, items }
}

const displayName = computed(() => auth.user?.name ?? 'Staff')
const displayEmail = computed(() => auth.user?.email ?? '')
const roleLabel = computed(() =>
  auth.user ? accountTypeLabel(auth.user.accountType) : 'Signed in',
)
const avCls = computed(() => avColor(displayName.value))
const avInitials = computed(() => initials(displayName.value))
const isSuperAdmin = computed(() => auth.can('system.admin.all'))

// Counts become live once list APIs land (Phase 1)
const nav = computed<NavSection[]>(() => {
  const sections: NavSection[] = [
    {
      label: 'Workspace',
      items: [
        { label: 'Dashboard', to: '/dashboard', ico: '▫' },
        { label: 'Invoices', to: '/invoices', ico: '▤', permission: 'invoices.read.all' },
        { label: 'Customers', to: '/customers', ico: '◉', permission: 'customers.read.all' },
        { label: 'Vehicles', to: '/vehicles', ico: '⛟', permission: 'vehicles.read.all' },
        { label: 'Service Logs', to: '/service-logs', ico: '✎', permission: ['service_logs.read.all', 'service_logs.read.own'] },
        { label: 'Portal Requests', to: '/portal-requests', ico: '✉', permission: 'portal_requests.review.all' },
        { label: 'Deletion Requests', to: '/deletion-requests', ico: '🗑', permission: 'deletion_requests.review.all' },
        { label: 'Catalog', to: '/catalog', ico: '▦', permission: 'catalog.read.all' },
      ],
    },
    {
      label: 'System',
      items: [
        { label: 'Users', to: '/users', ico: '👥', permission: 'users.read.all' },
        { label: 'System Logs', to: '/system-logs', ico: '▣', permission: 'audit.read.all' },
      ],
    },
  ]

  if (isSuperAdmin.value) {
    sections.push({
      label: 'Administration',
      items: [{ label: 'Control Panel', to: '/admin', ico: '⚙', permission: 'system.admin.all' }],
    })
  }

  return sections.map(filterSection).filter((s): s is NavSection => s !== null)
})

async function signOut() {
  closeOverlays()
  await auth.logout()
}

const crumb = computed(() => {
  if (route.path === '/invoices/new') return 'New invoice'
  if (/^\/invoices\/[^/]+/.test(route.path) && route.path !== '/invoices/new') {
    return 'Invoice'
  }
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
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <!-- SIDEBAR -->
    <nav class="side" :class="{ open: sidebarOpen }" aria-label="Primary">
      <div class="logo"><img class="sq" :src="BRAND_ICON" alt="" width="32" height="32"> {{ BRAND_NAME }}</div>
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
            <span class="av" :class="avCls">{{ avInitials }}</span>
            <span class="who"><b>{{ displayName }}</b><small>{{ displayEmail || 'DORINC' }}</small></span>
            <span class="car">▾</span>
          </button>
          <div class="menu" :class="{ open: menuOpen }" role="menu">
            <div class="mhead">
              <b>{{ displayName }}</b>
              <small>{{ displayEmail }}</small>
              <span class="role">{{ roleLabel }}</span>
            </div>
            <NuxtLink to="/account" class="menu-link" role="menuitem" @click="closeOverlays">
              👤 &nbsp;My account
            </NuxtLink>
            <NuxtLink v-if="isSuperAdmin" to="/admin" class="menu-link" role="menuitem" @click="closeOverlays">
              🛡 &nbsp;Control panel
            </NuxtLink>
            <hr>
            <button class="danger" @click="signOut">⏻ &nbsp;Sign out</button>
          </div>
        </div>
      </header>

      <div class="pwa-banner-wrap">
        <PwaInstallBanner />
      </div>

      <main id="main-content" class="main-body">
        <slot />
      </main>
    </div>

    <HelpPlatformHelpWidget />
  </div>
</template>

<style scoped>
.menu-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  text-decoration: none;
}
.menu-link:hover {
  background: #f1f5f9;
  color: #0f172a;
}
</style>
