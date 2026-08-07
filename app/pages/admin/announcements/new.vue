<script setup lang="ts">
import AnnouncementEditorWorkbench from '~/components/admin/AnnouncementEditorWorkbench.vue'
import type { AnnouncementEditorForm } from '~/utils/announcements-ui'
import {
  announcementSaveErrorMessage,
  localDateTimeToIso,
} from '~/utils/announcements-ui'
import {
  announcementBodyHasInlineDataImages,
  materializeAnnouncementDataImages,
  uploadAnnouncementImage,
} from '~/utils/announcement-inline-images'

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

const announcementId = ref<string | null>(null)
const busy = ref(false)
const uploadBusy = ref(false)
const error = ref('')
let ensureLock: Promise<string> | null = null

function buildAudience() {
  if (form.value.audienceMode === 'account_type') {
    return { targetType: 'account_type' as const, accountTypeKeys: [...form.value.accountTypeKeys] }
  }
  if (form.value.audienceMode === 'user') {
    return { targetType: 'user' as const, userIds: [...form.value.userIds] }
  }
  return { targetType: 'all' as const }
}

function validateFormBasics(): string | null {
  if (form.value.audienceMode === 'account_type' && !form.value.accountTypeKeys.length) {
    return 'Select at least one account type'
  }
  if (form.value.audienceMode === 'user' && !form.value.userIds.length) {
    return 'Select at least one user'
  }
  if (!Number.isFinite(form.value.priority)) {
    return 'Priority must be a whole number'
  }
  return null
}

function scheduleDates(): { startsAt: string | null, endsAt: string | null } | string {
  const startsAt = form.value.startsAt ? localDateTimeToIso(form.value.startsAt) : null
  const endsAt = form.value.endsAt ? localDateTimeToIso(form.value.endsAt) : null
  if (form.value.startsAt && !startsAt) return 'Starts date/time is invalid'
  if (form.value.endsAt && !endsAt) return 'Ends date/time is invalid'
  return { startsAt, endsAt }
}

/** Soft dates/audience for auto-draft create (image paste/upload before full validation). */
function draftAudience() {
  if (form.value.audienceMode === 'account_type' && form.value.accountTypeKeys.length) {
    return { targetType: 'account_type' as const, accountTypeKeys: [...form.value.accountTypeKeys] }
  }
  if (form.value.audienceMode === 'user' && form.value.userIds.length) {
    return { targetType: 'user' as const, userIds: [...form.value.userIds] }
  }
  return { targetType: 'all' as const }
}

function draftScheduleDates() {
  const startsAt = form.value.startsAt ? localDateTimeToIso(form.value.startsAt) : null
  const endsAt = form.value.endsAt ? localDateTimeToIso(form.value.endsAt) : null
  return {
    startsAt: form.value.startsAt && !startsAt ? null : startsAt,
    endsAt: form.value.endsAt && !endsAt ? null : endsAt,
  }
}

function syncBrowserUrl(id: string) {
  if (!import.meta.client) return
  const next = `/admin/announcements/${id}`
  if (window.location.pathname !== next) {
    window.history.replaceState(window.history.state, '', next)
  }
}

async function ensureAnnouncementId(): Promise<string> {
  if (announcementId.value) return announcementId.value
  if (ensureLock) return ensureLock

  ensureLock = (async () => {
    const dates = draftScheduleDates()

    // Persist a draft first so file uploads have an owner id. Keep oversized
    // pasted data-URLs out of the initial insert; the editor materializes them next.
    const res = await $fetch<{ announcement: { id: string } }>('/api/admin/announcements', {
      method: 'POST',
      body: {
        title: form.value.title.trim() || 'Untitled message',
        subtitle: form.value.subtitle || null,
        bodyHtml: '',
        heroImageFileId: form.value.heroImageFileId,
        isActive: form.value.isActive,
        priority: Number.isFinite(form.value.priority) ? form.value.priority : 0,
        startsAt: dates.startsAt,
        endsAt: dates.endsAt,
        ctaButtons: [],
        audience: draftAudience(),
      },
    })
    announcementId.value = res.announcement.id
    if (!form.value.title.trim()) form.value.title = 'Untitled message'
    syncBrowserUrl(res.announcement.id)
    return res.announcement.id
  })().finally(() => {
    ensureLock = null
  })

  return ensureLock
}

async function prepareBodyHtml(id: string): Promise<string> {
  return materializeAnnouncementDataImages(form.value.bodyHtml, id)
}

async function createMessage() {
  if (!form.value.title.trim()) {
    error.value = 'Title is required'
    return
  }
  const audienceError = validateFormBasics()
  if (audienceError) {
    error.value = audienceError
    return
  }

  const dates = scheduleDates()
  if (typeof dates === 'string') {
    error.value = dates
    return
  }

  busy.value = true
  error.value = ''
  try {
    const payloadBase = {
      title: form.value.title,
      subtitle: form.value.subtitle || null,
      heroImageFileId: form.value.heroImageFileId,
      isActive: form.value.isActive,
      priority: form.value.priority,
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
      ctaButtons: [],
      audience: buildAudience(),
    }

    // Already drafted (e.g. after image paste/upload) — patch full form.
    if (announcementId.value) {
      const bodyHtml = await prepareBodyHtml(announcementId.value)
      form.value.bodyHtml = bodyHtml
      await $fetch(`/api/admin/announcements/${announcementId.value}`, {
        method: 'PATCH',
        body: { ...payloadBase, bodyHtml },
      })
      await navigateTo(`/admin/announcements/${announcementId.value}`)
      return
    }

    // Body still has pasted data-URLs — create draft id, upload images, then save.
    if (announcementBodyHasInlineDataImages(form.value.bodyHtml)) {
      const id = await ensureAnnouncementId()
      const bodyHtml = await prepareBodyHtml(id)
      form.value.bodyHtml = bodyHtml
      await $fetch(`/api/admin/announcements/${id}`, {
        method: 'PATCH',
        body: { ...payloadBase, bodyHtml },
      })
      await navigateTo(`/admin/announcements/${id}`)
      return
    }

    const res = await $fetch<{ announcement: { id: string } }>('/api/admin/announcements', {
      method: 'POST',
      body: {
        ...payloadBase,
        bodyHtml: form.value.bodyHtml,
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

async function onHeroUpload(file: File) {
  uploadBusy.value = true
  error.value = ''
  try {
    const id = await ensureAnnouncementId()
    const uploaded = await uploadAnnouncementImage(id, file)
    form.value.heroImageFileId = uploaded.id
    form.value.heroImageUrl = uploaded.url
    await $fetch(`/api/admin/announcements/${id}`, {
      method: 'PATCH',
      body: { heroImageFileId: uploaded.id },
    })
  }
  catch (err: unknown) {
    error.value = announcementSaveErrorMessage(err, 'Hero image upload failed')
  }
  finally {
    uploadBusy.value = false
  }
}

function clearHero() {
  form.value.heroImageFileId = null
  form.value.heroImageUrl = null
}

function onAnnouncementId(id: string) {
  announcementId.value = id
  syncBrowserUrl(id)
}
</script>

<template>
  <section class="page active ann-page">
    <StaffPageHead subtitle="Design the full-screen message staff must continue through after login">
      <template #title>New Login Message</template>
      <template #actions>
        <NuxtLink to="/admin/announcements" class="btn">Cancel</NuxtLink>
        <button type="button" class="btn primary" :disabled="busy" @click="createMessage">
          {{ busy ? 'Saving…' : announcementId ? 'Save message' : 'Create message' }}
        </button>
      </template>
    </StaffPageHead>

    <p v-if="error" class="help ann-error" role="alert">{{ error }}</p>

    <AnnouncementEditorWorkbench
      v-model="form"
      :announcement-id="announcementId"
      :ensure-announcement-id="ensureAnnouncementId"
      :account-types="options?.accountTypes ?? []"
      :users="options?.users ?? []"
      :upload-busy="uploadBusy"
      @hero-upload="onHeroUpload"
      @clear-hero="clearHero"
      @update:announcement-id="onAnnouncementId"
      @error="error = $event"
    />

    <div class="ann-sticky-actions" role="region" aria-label="Save actions">
      <NuxtLink to="/admin/announcements" class="btn">Cancel</NuxtLink>
      <button type="button" class="btn primary" :disabled="busy" @click="createMessage">
        {{ busy ? 'Saving…' : announcementId ? 'Save message' : 'Create message' }}
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
