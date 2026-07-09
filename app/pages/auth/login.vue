<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const initialCard = computed(() => (route.query.card === 'staff' ? 'staff' : 'customer'))
</script>

<template>
  <AuthScreen :initial-card="initialCard" initial-tab="login" />
</template>
