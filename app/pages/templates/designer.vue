<script setup lang="ts">
definePageMeta({ layout: 'staff' })

const route = useRoute()

const query: Record<string, string> = { tab: 'designer' }
const template = route.query.template
if (typeof template === 'string' && template) {
  query.template = template
}

await navigateTo({ path: '/admin', query }, { replace: true })
</script>

<template>
  <div class="empty">Opening Control Panel…</div>
</template>
