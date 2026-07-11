<script setup lang="ts">
export type StaffNavIconName =
  | 'dashboard'
  | 'invoices'
  | 'customers'
  | 'vehicles'
  | 'service-logs'
  | 'portal-requests'
  | 'deletion-requests'
  | 'catalog'
  | 'users'
  | 'system-logs'
  | 'control-panel'

defineProps<{
  name: StaffNavIconName
}>()
</script>

<template>
  <svg
    class="staff-nav-icon"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <!-- Dashboard -->
    <template v-if="name === 'dashboard'">
      <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.75" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.75" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.75" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.75" />
    </template>

    <!-- Invoices -->
    <template v-else-if="name === 'invoices'">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linejoin="round"
      />
      <path d="M14 2v6h6M9 13h6M9 17h4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
    </template>

    <!-- Customers -->
    <template v-else-if="name === 'customers'">
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" stroke-width="1.75" />
      <path
        d="M3.5 19.5c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
      />
      <path
        d="M16 11.5a2.5 2.5 0 1 1 0 5M19.5 19.5c-.5-2-1.8-3.5-3.5-3.5"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
      />
    </template>

    <!-- Vehicles -->
    <template v-else-if="name === 'vehicles'">
      <path
        d="M3 13h1.2l1.4-4.2A2 2 0 0 1 7.5 7h9a2 2 0 0 1 1.9 1.4L19.8 13H21"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M5 17h14M6.5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17.5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>

    <!-- Service Logs -->
    <template v-else-if="name === 'service-logs'">
      <path
        d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linejoin="round"
      />
      <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.75" />
      <path d="M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
    </template>

    <!-- Portal Requests -->
    <template v-else-if="name === 'portal-requests'">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.75" />
      <path d="m3 7 9 6 9-6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <!-- Deletion Requests -->
    <template v-else-if="name === 'deletion-requests'">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M10 11v6M14 11v6M6 7l.8 12.4A2 2 0 0 0 8.8 21.4h6.4a2 2 0 0 0 2-2L18 7"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>

    <!-- Catalog -->
    <template v-else-if="name === 'catalog'">
      <path
        d="M21 8.5 12 3 3 8.5 12 14l9-5.5Z"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linejoin="round"
      />
      <path
        d="M3 12.5 12 18l9-5.5M3 16.5 12 22l9-5.5"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linejoin="round"
      />
    </template>

    <!-- Users -->
    <template v-else-if="name === 'users'">
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" stroke-width="1.75" />
      <path
        d="M3.5 19.5c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
      />
      <circle cx="17.5" cy="9" r="2.25" stroke="currentColor" stroke-width="1.75" />
      <path
        d="M15 19.5c.4-1.8 1.6-3 3.5-3s3.1 1.2 3.5 3"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
      />
    </template>

    <!-- System Logs -->
    <template v-else-if="name === 'system-logs'">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" />
      <path d="M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
    </template>

    <!-- Control Panel -->
    <template v-else-if="name === 'control-panel'">
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.75" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
      />
    </template>
  </svg>
</template>
