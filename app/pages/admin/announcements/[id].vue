<script setup lang="ts">
import AnnouncementRichEditor from '~/components/admin/AnnouncementRichEditor.vue'
import { accountTypeLabel } from '~/utils/users-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

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
  users: Array<{ id: string, name: string, email: string }>
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

const form = reactive({
  title: '',
  subtitle: '',
  bodyHtml: '',
  heroImageFileId: null as string | null,
  heroImageUrl: null as string | null,
  isActive: false,
  priority: 0,
  startsAt: '',
  endsAt: '',
  audienceMode: 'all' as 'all' | 'account_type' | 'user',
  accountTypeKeys: [] as string[],
  userIds: [] as string[],
  ctaButtons: [] as Array<{ label: string, href: string, variant: 'primary' | 'secondary' | 'ghost' }>,
})

const hydrated = ref(false)
const busy = ref(false)
const uploadBusy = ref(false)
const error = ref('')
const savedNote = ref('')
const userFilter = ref('')

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
  form.title = ann.title
  form.subtitle = ann.subtitle ?? ''
  form.bodyHtml = ann.bodyHtml ?? ''
  form.heroImageFileId = ann.heroImageFileId
  form.heroImageUrl = ann.heroImageUrl
  form.isActive = ann.isActive
  form.priority = ann.priority
  form.startsAt = toLocalInput(ann.startsAt)
  form.endsAt = toLocalInput(ann.endsAt)
  form.audienceMode = ann.audienceMode
  form.accountTypeKeys = [...ann.accountTypeKeys]
  form.userIds = [...ann.userIds]
  form.ctaButtons = (ann.ctaButtons ?? []).map(b => ({
    label: b.label,
    href: b.href,
    variant: b.variant ?? 'secondary',
  }))
  hydrated.value = true
}, { immediate: true })

const filteredUsers = computed(() => {
  const q = userFilter.value.trim().toLowerCase()
  const list = options.value?.users ?? []
  if (!q) return list
  return list.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  )
})

function addCta() {
  form.ctaButtons.push({ label: '', href: '/', variant: 'secondary' })
}

function removeCta(index: number) {
  form.ctaButtons.splice(index, 1)
}

function toggleType(key: string) {
  const i = form.accountTypeKeys.indexOf(key)
  if (i >= 0) form.accountTypeKeys.splice(i, 1)
  else form.accountTypeKeys.push(key)
}

function toggleUser(userId: string) {
  const i = form.userIds.indexOf(userId)
  if (i >= 0) form.userIds.splice(i, 1)
  else form.userIds.push(userId)
}

function buildAudience() {
  if (form.audienceMode === 'account_type') {
    return { targetType: 'account_type' as const, accountTypeKeys: [...form.accountTypeKeys] }
  }
  if (form.audienceMode === 'user') {
    return { targetType: 'user' as const, userIds: [...form.userIds] }
  }
  return { targetType: 'all' as const }
}

async function saveMessage() {
  if (!form.title.trim()) {
    error.value = 'Title is required'
    return
  }
  busy.value = true
  error.value = ''
  savedNote.value = ''
  try {
    await $fetch(`/api/admin/announcements/${id.value}`, {
      method: 'PATCH',
      body: {
        title: form.title,
        subtitle: form.subtitle || null,
        bodyHtml: form.bodyHtml,
        heroImageFileId: form.heroImageFileId,
        isActive: form.isActive,
        priority: form.priority,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        ctaButtons: form.ctaButtons.filter(b => b.label.trim() && b.href.trim()),
        audience: buildAudience(),
      },
    })
    savedNote.value = 'Saved'
    await refresh()
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not save message')
  }
  finally {
    busy.value = false
  }
}

async function onHeroUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploadBusy.value = true
  error.value = ''
  try {
    const body = new FormData()
    body.append('file', file)
    body.append('ownerEntityType', 'announcement')
    body.append('ownerEntityId', id.value)
    body.append('fileKind', 'attachment')
    const res = await $fetch<{ file: { id: string } }>('/api/files', {
      method: 'POST',
      body,
    })
    form.heroImageFileId = res.file.id
    form.heroImageUrl = `/api/files/${res.file.id}/preview`
    await saveMessage()
  }
  catch (err: unknown) {
    error.value = syncFetchErrorMessage(err, 'Hero image upload failed')
  }
  finally {
    uploadBusy.value = false
  }
}

function clearHero() {
  form.heroImageFileId = null
  form.heroImageUrl = null
}
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Edit mandatory login message">
      <template #title>{{ form.title || 'Login message' }}</template>
      <template #actions>
        <NuxtLink to="/admin/announcements" class="btn">Back</NuxtLink>
        <button type="button" class="btn primary" :disabled="busy || !hydrated" @click="saveMessage">
          {{ busy ? 'Saving…' : 'Save' }}
        </button>
      </template>
    </StaffPageHead>

    <p v-if="loadError" class="help" style="color:#dc2626;">Could not load message.</p>
    <p v-else-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
    <p v-else-if="savedNote" class="help" style="color:#15803d;">{{ savedNote }}</p>
    <div v-if="pending && !hydrated" class="cp-state">Loading…</div>

    <div v-else class="card ann-form">
      <label class="fld">
        <span>Title</span>
        <input v-model="form.title" type="text" maxlength="200">
      </label>
      <label class="fld">
        <span>Subtitle (optional)</span>
        <input v-model="form.subtitle" type="text" maxlength="300">
      </label>

      <div class="fld">
        <span>Hero image (optional)</span>
        <div v-if="form.heroImageUrl" class="ann-hero-preview">
          <img :src="form.heroImageUrl" alt="Hero preview">
          <button type="button" class="btn sm" @click="clearHero">Remove</button>
        </div>
        <label class="btn sm ann-upload">
          {{ uploadBusy ? 'Uploading…' : 'Upload hero image' }}
          <input type="file" accept="image/*" :disabled="uploadBusy" @change="onHeroUpload">
        </label>
      </div>

      <label class="fld">
        <span>Body</span>
        <AnnouncementRichEditor v-model="form.bodyHtml" :announcement-id="id" />
      </label>

      <div class="ann-grid">
        <label class="fld">
          <span>Priority</span>
          <input v-model.number="form.priority" type="number" min="-1000" max="1000">
        </label>
        <label class="fld chk">
          <input v-model="form.isActive" type="checkbox">
          <span>Active</span>
        </label>
      </div>

      <div class="ann-grid">
        <label class="fld">
          <span>Starts (optional)</span>
          <input v-model="form.startsAt" type="datetime-local">
        </label>
        <label class="fld">
          <span>Ends (optional)</span>
          <input v-model="form.endsAt" type="datetime-local">
        </label>
      </div>

      <fieldset class="ann-audience">
        <legend>Audience</legend>
        <label class="fld radio"><input v-model="form.audienceMode" type="radio" value="all"> All staff</label>
        <label class="fld radio"><input v-model="form.audienceMode" type="radio" value="account_type"> Account types</label>
        <label class="fld radio"><input v-model="form.audienceMode" type="radio" value="user"> Specific users</label>

        <div v-if="form.audienceMode === 'account_type'" class="ann-chips">
          <label
            v-for="type in options?.accountTypes ?? []"
            :key="type.key"
            class="ann-chip"
            :class="{ on: form.accountTypeKeys.includes(type.key) }"
          >
            <input type="checkbox" :checked="form.accountTypeKeys.includes(type.key)" @change="toggleType(type.key)">
            {{ type.name || accountTypeLabel(type.key) }}
          </label>
        </div>

        <div v-if="form.audienceMode === 'user'" class="ann-users">
          <input v-model="userFilter" type="search" placeholder="Filter users…" class="ann-user-filter">
          <label
            v-for="user in filteredUsers"
            :key="user.id"
            class="ann-user-row"
          >
            <input type="checkbox" :checked="form.userIds.includes(user.id)" @change="toggleUser(user.id)">
            <span>
              <b>{{ user.name }}</b>
              <span class="help">{{ user.email }} · {{ accountTypeLabel(user.accountType) }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div class="ann-ctas">
        <div class="ann-ctas-head">
          <h3>Buttons (optional)</h3>
          <button type="button" class="btn sm" @click="addCta">+ Add button</button>
        </div>
        <div v-for="(btn, index) in form.ctaButtons" :key="index" class="ann-cta-row">
          <input v-model="btn.label" type="text" placeholder="Label">
          <input v-model="btn.href" type="text" placeholder="/training or https://…">
          <select v-model="btn.variant">
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="ghost">Ghost</option>
          </select>
          <button type="button" class="btn sm" @click="removeCta(index)">Remove</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ann-form {
  padding: 20px;
  display: grid;
  gap: 14px;
}
.ann-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.fld.chk, .fld.radio {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ann-audience {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
}
.ann-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.ann-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 13px;
}
.ann-chip.on {
  border-color: #2563eb;
  background: #eff6ff;
}
.ann-users {
  margin-top: 10px;
  max-height: 260px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.ann-user-filter {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #e5e7eb;
  padding: 10px 12px;
}
.ann-user-row {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.ann-ctas-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ann-ctas-head h3 {
  margin: 0;
  font-size: 1rem;
}
.ann-cta-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr 120px auto;
  gap: 8px;
  margin-top: 8px;
}
.ann-hero-preview {
  display: grid;
  gap: 8px;
  margin-bottom: 8px;
}
.ann-hero-preview img {
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  border-radius: 10px;
}
.ann-upload {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  width: fit-content;
}
.ann-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
@media (max-width: 800px) {
  .ann-grid, .ann-cta-row {
    grid-template-columns: 1fr;
  }
}
</style>
