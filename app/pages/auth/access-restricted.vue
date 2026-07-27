<script setup lang="ts">
definePageMeta({
  layout: false,
  // Static notice page — no client data fetches / no scoping requests.
  ssr: true,
})
</script>

<template>
  <AuthServiceAreaShell title-lead="Service Area" title-accent="Restriction">
    <p>
      You're trying to access Dorinc Suite<br>
      outside of our service area.<br>
      Sorry for the inconvenience.<br>
      Please contact an administrator<br>
      for assistance.
    </p>
  </AuthServiceAreaShell>
</template>
