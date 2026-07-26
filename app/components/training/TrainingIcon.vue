<script setup lang="ts">
/** Line icons for training modules — same stroke language as StaffNavIcon. */
export type TrainingIconName =
  | 'workflow'
  | 'compass'
  | 'mic'
  | 'camera'
  | 'clipboard'
  | 'invoice'
  | 'users'
  | 'portal'
  | 'message'
  | 'shield'
  | 'check'
  | 'book'

withDefaults(defineProps<{ name?: string, size?: number }>(), {
  name: 'book',
  size: 20,
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Workflow: three connected nodes -->
    <template v-if="name === 'workflow'">
      <rect x="3" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="14" y="9.5" width="7" height="5" rx="1.5" />
      <rect x="3" y="15.5" width="7" height="5" rx="1.5" />
      <path d="M10 6h2.5a1.5 1.5 0 0 1 1.5 1.5V9M14 15v1.5A1.5 1.5 0 0 1 12.5 18H10" />
    </template>

    <!-- Compass -->
    <template v-else-if="name === 'compass'">
      <circle cx="12" cy="12" r="9" />
      <path d="m14.5 9.5-1.6 4.2-4.2 1.6 1.6-4.2 4.2-1.6Z" />
    </template>

    <!-- Mic -->
    <template v-else-if="name === 'mic'">
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </template>

    <!-- Camera -->
    <template v-else-if="name === 'camera'">
      <path d="M4 8h2.5l1.2-2h8.6L17.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.25" />
    </template>

    <!-- Clipboard -->
    <template v-else-if="name === 'clipboard'">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </template>

    <!-- Invoice -->
    <template v-else-if="name === 'invoice'">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </template>

    <!-- Users -->
    <template v-else-if="name === 'users'">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />
      <circle cx="17.5" cy="9" r="2.25" />
      <path d="M15 19.5c.4-1.8 1.6-3 3.5-3s3.1 1.2 3.5 3" />
    </template>

    <!-- Portal (browser window) -->
    <template v-else-if="name === 'portal'">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
    </template>

    <!-- Message -->
    <template v-else-if="name === 'message'">
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9Z" />
      <path d="M8.5 9h7M8.5 12.5h4" />
    </template>

    <!-- Shield -->
    <template v-else-if="name === 'shield'">
      <path d="M12 3l7.5 3v6c0 4.2-3 7.7-7.5 9-4.5-1.3-7.5-4.8-7.5-9V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </template>

    <!-- Check -->
    <template v-else-if="name === 'check'">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </template>

    <!-- Book (fallback) -->
    <template v-else>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" />
      <path d="M8 7.5h7M8 11h5" />
    </template>
  </svg>
</template>
