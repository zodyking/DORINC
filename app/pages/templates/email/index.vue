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
    <StaffPageHead subtitle="Browse email types, edit content, preview, and set the active template for outbound mail">
      <template #title>Email Template Editor</template>
      <template #actions>
        <NuxtLink to="/admin?tab=notifications" class="btn">Back to notifications</NuxtLink>
      </template>
    </StaffPageHead>

    <EmailTemplateEditorWorkbench />
  </section>
</template>
