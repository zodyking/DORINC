<script setup lang="ts">
import EmailTemplateEditorWorkbench from '~/components/admin/EmailTemplateEditorWorkbench.vue'

definePageMeta({ layout: 'staff', permission: 'templates.read.all' })

const auth = useAuthStore()

if (import.meta.client && auth.loaded && !auth.can('templates.read.all')) {
  navigateTo('/dashboard')
}
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Edit raw HTML email templates, tune content fields, preview, and set the active template">
      <template #title>Email Template Editor</template>
      <template #actions>
        <NuxtLink to="/admin?tab=notifications" class="btn">Back to notifications</NuxtLink>
      </template>
    </StaffPageHead>

    <EmailTemplateEditorWorkbench />
  </section>
</template>
