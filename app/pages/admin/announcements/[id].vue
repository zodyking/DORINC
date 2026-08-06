<script setup lang="ts">
import AnnouncementEditorWorkbench from '~/components/admin/AnnouncementEditorWorkbench.vue'
import type { AnnouncementEditorForm } from '~/utils/announcements-ui'
import {
  announcementSaveErrorMessage,
  localDateTimeToIso,
} from '~/utils/announcements-ui'
import {
  materializeAnnouncementDataImages,
  uploadAnnouncementImage,
} from '~/utils/announcement-inline-images'

definePageMeta({ layout: 'staff', permission: 'system.admin.all' })

const route = useRoute()
const id = computed(() => String(route.params.id))

interface AnnouncementDetail {
  id: string
  title: string
  subtitle: string | null
  bodyHtml: string
  heroImageFileId: string | null
  heroImageUrl: string | null
  ctaButtons: Array<{ label: string, href: string, variant?: 'primary' | 'secondary' | 'ghost' }>
  isActive: boolean
  priority: number
  startsAt: string | null
  endsAt: string | null
  audienceMode: 'all' | 'account_type' | 'user'
  accountTypeKeys: string[]
  userIds: string[]
}

interface OptionsPayload {
  accountTypes: Array<{ key: string, name: string }>
  users: Array<{ id: string, name: string, email: string, accountType: string }>
}

const { data, refresh, pending, error: loadError } = useClientFetch<{ announcement: AnnouncementDetail }>(
  () => `/api/admin/announcements/${id.value}`,
  { watch: [id] },
)
const { data: options } = useClientFetch<OptionsPayload>('/api/admin/announcements/options')

const form = ref<AnnouncementEditorForm>({
  title: '',
  subtitle: '',
  bodyHtml: '',
  heroImageFileId: null,
  heroImageUrl: null,
  isActive: false,
  priority: 0,
  startsAt: '',
  endsAt: '',
  audienceMode: 'all',
  accountTypeKeys: [],
  userIds: [],
  ctaButtons: [],
})

const hydrated = ref(false)
const busy = ref(false)
const uploadBusy = ref(false)
const error = ref('')
const savedNote = ref('')

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

watch(data, (payload) => {
  const ann = payload?.announcement
  if (!ann) return
  form.value = {
    title: ann.title,
    subtitle: ann.subtitle ?? '',
    bodyHtml: ann.bodyHtml ?? '',
    heroImageFileId: ann.heroImageFileId,
    heroImageUrl: ann.heroImageUrl,
    isActive: ann.isActive,
    priority: ann.priority,
    startsAt: toLocalInput(ann.startsAt),
    endsAt: toLocalInput(ann.endsAt),
    audienceMode: ann.audienceMode,
    accountTypeKeys: [...ann.accountTypeKeys],
    userIds: [...ann.userIds],
    ctaButtons: (ann.ctaButtons ?? []).map(b => ({
      label: b.label,
      href: b.href,
      variant: b.variant ?? 'secondary',
    })),
  }
  hydrated.value = true
}, { immediate: true })

function buildAudience() {
  if (form.value.audienceMode === 'account_type') {
    return { targetType: 'account_type' as const, accountTypeKeys: [...form.value.accountTypeKeys] }
  }
  if (form.value.audienceMode === 'user') {
    return { targetType: 'user' as const, userIds: [...form.value.userIds] }
  }
  return { targetType: 'all' as const }
}

async function saveMessage() {
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
  savedNote.value = ''
  try {
    const bodyHtml = await materializeAnnouncementDataImages(form.value.bodyHtml, id.value)
    form.value.bodyHtml = bodyHtml
    await $fetch(`/api/admin/announcements/${id.value}`, {
      method: 'PATCH',
      body: {
        title: form.value.title,
        subtitle: form.value.subtitle || null,
        bodyHtml,
        heroImageFileId: form.value.heroImageFileId,
        isActive: form.value.isActive,
        priority: form.value.priority,
        startsAt,
        endsAt,
        ctaButtons: [],
        audience: buildAudience(),
      },
    })
    savedNote.value = 'Saved'
    await refresh()
  }
  catch (e: unknown) {
    error.value = announcementSaveErrorMessage(e, 'Could not save message')
  }
  finally {
    busy.value = false
  }
}

async function ensureAnnouncementId(): Promise<string> {
  return id.value
}

async function onHeroUpload(file: File) {
  uploadBusy.value = true
  error.value = ''
  try {
    const uploaded = await uploadAnnouncementImage(id.value, file)
    form.value.heroImageFileId = uploaded.id
    form.value.heroImageUrl = uploaded.url
    await saveMessage()
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
</script>

<template>
  <section class="page active ann-page">
    <StaffPageHead subtitle="Edit the full-screen message and preview exactly how staff will see it">
      <template #title>{{ form.title || 'Login message' }}</template>
      <template #actions>
        <NuxtLink to="/admin/announcements" class="btn">Back</NuxtLink>
        <button type="button" class="btn primary" :disabled="busy || !hydrated" @click="saveMessage">
          {{ busy ? 'Saving…' : 'Save' }}
        </button>
      </template>
    </StaffPageHead>

    <p v-if="loadError" class="help ann-error" role="alert">Could not load message.</p>
    <p v-else-if="error" class="help ann-error" role="alert">{{ error }}</p>
    <p v-else-if="savedNote" class="help ann-ok" role="status">{{ savedNote }}</p>
    <div v-if="pending && !hydrated" class="cp-state">Loading…</div>

    <AnnouncementEditorWorkbench
      v-else
      v-model="form"
      :announcement-id="id"
      :ensure-announcement-id="ensureAnnouncementId"
      :account-types="options?.accountTypes ?? []"
      :users="options?.users ?? []"
      :upload-busy="uploadBusy"
      @hero-upload="onHeroUpload"
      @clear-hero="clearHero"
      @error="error = $event"
    />

    <div
      v-if="hydrated"
      class="ann-sticky-actions"
      role="region"
      aria-label="Save actions"
    >
      <NuxtLink to="/admin/announcements" class="btn">Back</NuxtLink>
      <button type="button" class="btn primary" :disabled="busy" @click="saveMessage">
        {{ busy ? 'Saving…' : 'Save message' }}
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
.ann-ok {
  color: #15803d;
  margin: 0 0 12px;
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
