<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'
import { avColor, initials } from '~/utils/users-ui'
import type { StaffNavIconName } from '~/components/staff/StaffNavIcon.vue'

const route = useRoute()
const auth = useAuthStore()

const sidebarOpen = ref(false)
const menuOpen = ref(false)

interface NavItem {
  label: string
  to: string
  icon: StaffNavIconName
}

const nav: NavItem[] = [
  { label: 'Home', to: '/portal', icon: 'dashboard' },
  { label: 'Invoices', to: '/portal/invoices', icon: 'invoices' },
  { label: 'Estimates', to: '/portal/estimates', icon: 'estimates' },
  { label: 'Fleet', to: '/portal/vehicles', icon: 'vehicles' },
  { label: 'Contact shop', to: '/portal/requests', icon: 'portal-requests' },
]

const { data: publicBusiness } = useClientFetch<{ businessName: string }>('/api/public/business')
const displayBusinessName = computed(() => {
  const name = publicBusiness.value?.businessName?.trim()
  return name || BRAND_NAME
})

const displayName = computed(() => auth.user?.name ?? 'Customer')
const displayUsername = computed(() => auth.user?.username ?? '')
const avCls = computed(() => avColor(displayName.value))
const avInitials = computed(() => initials(displayName.value))

const crumb = computed(() => {
  if (route.path === '/portal/account') return 'Account'
  const hit = nav.find(item => isActive(item.to))
  return hit?.label ?? 'Home'
})

function isActive(to: string): boolean {
  if (to === '/portal') return route.path === '/portal'
  return route.path === to || route.path.startsWith(`${to}/`)
}

function closeOverlays() {
  menuOpen.value = false
}

async function signOut() {
  closeOverlays()
  await auth.logout()
}

watch(() => route.path, () => {
  sidebarOpen.value = false
  closeOverlays()
})
</script>

<template>
  <div class="app portal-app">
    <a class="skip-link" href="#main-content">Skip to main content</a>

    <nav class="side" :class="{ open: sidebarOpen }" aria-label="Customer portal">
      <div class="logo">
        <img class="sq" :src="BRAND_ICON" alt="" width="32" height="32">
        {{ displayBusinessName }}
      </div>
      <div class="label">Portal</div>
      <NuxtLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ on: isActive(item.to) }"
      >
        <span class="ico" aria-hidden="true"><StaffNavIcon :name="item.icon" /></span>
        <span class="nav-label">{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <button
      class="scrim"
      :class="{ show: sidebarOpen }"
      aria-label="Close menu"
      tabindex="-1"
      @click="sidebarOpen = false"
    />

    <div class="main">
      <header class="topbar">
        <button class="burger" aria-label="Open navigation" @click="sidebarOpen = !sidebarOpen">☰</button>
        <span class="crumb">Portal / <b>{{ crumb }}</b></span>
        <span class="spacer" />
        <div class="acct">
          <button
            class="avbtn"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            <span class="av" :class="avCls">{{ avInitials }}</span>
            <span class="who">
              <b>{{ displayName }}</b>
              <small>{{ displayUsername || 'Customer portal' }}</small>
            </span>
            <span class="car">▾</span>
          </button>
          <div class="menu" :class="{ open: menuOpen }" role="menu">
            <div class="mhead">
              <b>{{ displayName }}</b>
              <small v-if="displayUsername">@{{ displayUsername }}</small>
              <span class="role">Customer portal</span>
            </div>
            <NuxtLink to="/portal/account" class="menu-link" role="menuitem" @click="closeOverlays">
              Account &amp; password
            </NuxtLink>
            <hr>
            <button class="danger" @click="signOut">Sign out</button>
          </div>
        </div>
      </header>

      <div class="pwa-banner-wrap portal-pwa-wrap">
        <PwaInstallBanner />
      </div>

      <main id="main-content" class="main-body">
        <slot />
      </main>

      <SuiteFooter />
    </div>
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
.portal-pwa-wrap {
  padding: 12px 28px 0;
}
@media (max-width: 960px) {
  .portal-pwa-wrap {
    padding: 12px 16px 0;
  }
}
</style>
