<script setup lang="ts">
import TemplateEditorWorkbench from '~/components/admin/TemplateEditorWorkbench.vue'

definePageMeta({ layout: 'staff', permission: 'templates.manage.all' })

const auth = useAuthStore()

if (import.meta.client && auth.loaded && !auth.can('templates.read.all')) {
  navigateTo('/dashboard')
}
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Edit invoice PDF layout, preview live output, and publish templates app-wide">
      <template #title>Template Editor</template>
      <template #actions>
        <NuxtLink to="/admin?tab=invoice" class="btn">Back to invoice settings</NuxtLink>
      </template>
    </StaffPageHead>

    <TemplateEditorWorkbench />
  </section>
</template>
