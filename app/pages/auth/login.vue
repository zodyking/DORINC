<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { data: publicBusiness } = useClientFetch<{ customerPortalEnabled?: boolean }>('/api/public/business')
const initialCard = computed(() => {
  if (publicBusiness.value?.customerPortalEnabled === false) return 'staff'
  return route.query.card === 'staff' ? 'staff' : 'customer'
})
</script>

<template>
  <AuthScreen :initial-card="initialCard" initial-tab="login" />
</template>
