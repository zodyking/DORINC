<script setup lang="ts">
definePageMeta({ layout: 'staff', permission: ['staples.read.all', 'printers.read.all'] })

const route = useRoute()
const query = { ...route.query, tab: 'staples' as const }
await navigateTo({ path: '/printers', query }, { replace: true })
</script>

<template>
  <p class="empty">Opening Print…</p>
</template>
