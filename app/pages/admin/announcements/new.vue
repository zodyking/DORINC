<script setup lang="ts">
import AnnouncementEditorWorkbench from '~/components/admin/AnnouncementEditorWorkbench.vue'
import type { AnnouncementEditorForm } from '~/utils/announcements-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({ layout: 'staff', permission: 'system.admin.all' })

interface OptionsPayload {
  accountTypes: Array<{ key: string, name: string }>
  users: Array<{ id: string, name: string, email: string, accountType: string }>
}

const { data: options } = useClientFetch<OptionsPayload>('/api/admin/announcements/options')

const form = ref<AnnouncementEditorForm>({
  title: '',
  subtitle: '',
  bodyHtml: '',
  heroImageFileId: null,
  heroImageUrl: null,
  isActive: true,
  priority: 10,
  startsAt: '',
  endsAt: '',
  audienceMode: 'all',
  accountTypeKeys: [],
  userIds: [],
  ctaButtons: [],
})

const busy = ref(false)
const error = ref('')

function buildAudience() {
  if (form.value.audienceMode === 'account_type') {
    return { targetType: 'account_type' as const, accountTypeKeys: [...form.value.accountTypeKeys] }
  }
  if (form.value.audienceMode === 'user') {
    return { targetType: 'user' as const, userIds: [...form.value.userIds] }
  }
  return { targetType: 'all' as const }
}

async function createMessage() {
  if (!form.value.title.trim()) {
    error.value = 'Title is required'
    return
  }
  if (form.value.audienceMode === 'account_type' && !form.value.accountTypeKeys.length) {
    error.value = 'Select at least one account type'
    return
  }
  if (form.value.audienceMode === 'user' && !form.value.userIds.length) {
    error.value = 'Select at least one user'
    return
  }

  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ announcement: { id: string } }>('/api/admin/announcements', {
      method: 'POST',
      body: {
        title: form.value.title,
        subtitle: form.value.subtitle || null,
        bodyHtml: form.value.bodyHtml,
        isActive: form.value.isActive,
        priority: form.value.priority,
        startsAt: form.value.startsAt ? new Date(form.value.startsAt).toISOString() : null,
        endsAt: form.value.endsAt ? new Date(form.value.endsAt).toISOString() : null,
        ctaButtons: form.value.ctaButtons.filter(b => b.label.trim() && b.href.trim()),
        audience: buildAudience(),
      },
    })
    await navigateTo(`/admin/announcements/${res.announcement.id}`)
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not create message')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page active ann-page">
    <StaffPageHead subtitle="Design the full-screen message staff must continue through after login">
      <template #title>New login message</template>
      <template #actions>
        <NuxtLink to="/admin/announcements" class="btn">Cancel</NuxtLink>
        <button type="button" class="btn primary" :disabled="busy" @click="createMessage">
          {{ busy ? 'Saving…' : 'Create message' }}
        </button>
      </template>
    </StaffPageHead>

    <p v-if="error" class="help ann-error">{{ error }}</p>

    <AnnouncementEditorWorkbench
      v-model="form"
      :account-types="options?.accountTypes ?? []"
      :users="options?.users ?? []"
    />
  </section>
</template>

<style scoped>
.ann-page {
  max-width: 1400px;
}
.ann-error {
  color: #dc2626;
  margin: 0 0 12px;
}
</style>
