<script setup lang="ts">
import AnnouncementEditorWorkbench from '~/components/admin/AnnouncementEditorWorkbench.vue'
import type { AnnouncementEditorForm } from '~/utils/announcements-ui'
import {
  announcementBodyHasInlineDataImages,
  announcementSaveErrorMessage,
  localDateTimeToIso,
} from '~/utils/announcements-ui'

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
  if (announcementBodyHasInlineDataImages(form.value.bodyHtml)) {
    error.value = 'Pasted inline images cannot be saved. Create the message first, then use the Image button to upload.'
    return
  }
  if (!Number.isFinite(form.value.priority)) {
    error.value = 'Priority must be a whole number'
    return
  }

  const startsAt = form.value.startsAt ? localDateTimeToIso(form.value.startsAt) : null
  const endsAt = form.value.endsAt ? localDateTimeToIso(form.value.endsAt) : null
  if (form.value.startsAt && !startsAt) {
    error.value = 'Starts date/time is invalid'
    return
  }
  if (form.value.endsAt && !endsAt) {
    error.value = 'Ends date/time is invalid'
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
        startsAt,
        endsAt,
        ctaButtons: form.value.ctaButtons.filter(b => b.label.trim() && b.href.trim()),
        audience: buildAudience(),
      },
    })
    await navigateTo(`/admin/announcements/${res.announcement.id}`)
  }
  catch (e: unknown) {
    error.value = announcementSaveErrorMessage(e, 'Could not create message')
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

    <p v-if="error" class="help ann-error" role="alert">{{ error }}</p>

    <AnnouncementEditorWorkbench
      v-model="form"
      :account-types="options?.accountTypes ?? []"
      :users="options?.users ?? []"
    />

    <div class="ann-sticky-actions" role="region" aria-label="Save actions">
      <NuxtLink to="/admin/announcements" class="btn">Cancel</NuxtLink>
      <button type="button" class="btn primary" :disabled="busy" @click="createMessage">
        {{ busy ? 'Saving…' : 'Create message' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.ann-page {
  max-width: 1100px;
  padding-bottom: 88px;
}
.ann-error {
  color: #dc2626;
  margin: 0 0 12px;
  white-space: pre-wrap;
}
.ann-sticky-actions {
  position: sticky;
  bottom: 12px;
  z-index: 30;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(8px);
}
</style>
