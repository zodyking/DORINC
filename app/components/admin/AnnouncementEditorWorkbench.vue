<script setup lang="ts">
import AnnouncementGateCard from '~/components/announcements/AnnouncementGateCard.vue'
import AnnouncementRichEditor from '~/components/admin/AnnouncementRichEditor.vue'
import type { AnnouncementEditorForm } from '~/utils/announcements-ui'
import { accountTypeLabel } from '~/utils/users-ui'

const form = defineModel<AnnouncementEditorForm>({ required: true })

const props = defineProps<{
  announcementId?: string | null
  ensureAnnouncementId?: () => Promise<string>
  accountTypes: Array<{ key: string, name: string }>
  users: Array<{ id: string, name: string, email: string, accountType: string }>
  uploadBusy?: boolean
}>()

const emit = defineEmits<{
  'hero-upload': [file: File]
  'clear-hero': []
  'update:announcementId': [id: string]
  error: [message: string]
}>()

type WorkbenchTab = 'editor' | 'preview'

const workbenchTab = ref<WorkbenchTab>('editor')
const userFilter = ref('')
const previewFullscreen = ref(false)

const filteredUsers = computed(() => {
  const q = userFilter.value.trim().toLowerCase()
  if (!q) return props.users
  return props.users.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  )
})

const continueLabel = computed(() => 'Continue to dashboard')

function setTab(tab: WorkbenchTab) {
  workbenchTab.value = tab
}

function toggleType(key: string) {
  const i = form.value.accountTypeKeys.indexOf(key)
  if (i >= 0) form.value.accountTypeKeys.splice(i, 1)
  else form.value.accountTypeKeys.push(key)
}

function toggleUser(id: string) {
  const i = form.value.userIds.indexOf(id)
  if (i >= 0) form.value.userIds.splice(i, 1)
  else form.value.userIds.push(id)
}

async function onHeroInput(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    if (!props.announcementId && props.ensureAnnouncementId) {
      const id = await props.ensureAnnouncementId()
      emit('update:announcementId', id)
    }
    emit('hero-upload', file)
  }
  catch {
    emit('error', 'Could not prepare this message for image upload.')
  }
}

function onPreviewKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') previewFullscreen.value = false
}

watch(previewFullscreen, (open) => {
  if (!import.meta.client) return
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) window.addEventListener('keydown', onPreviewKeydown)
  else window.removeEventListener('keydown', onPreviewKeydown)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onPreviewKeydown)
})
</script>

<template>
  <div class="ann-workbench">
    <div class="ann-workbench-tabs" role="tablist" aria-label="Login message editor">
      <button
        type="button"
        role="tab"
        class="ann-tab"
        :class="{ on: workbenchTab === 'editor' }"
        :aria-selected="workbenchTab === 'editor'"
        @click="setTab('editor')"
      >
        Editor
      </button>
      <button
        type="button"
        role="tab"
        class="ann-tab"
        :class="{ on: workbenchTab === 'preview' }"
        :aria-selected="workbenchTab === 'preview'"
        @click="setTab('preview')"
      >
        Preview
      </button>
    </div>

    <div
      v-show="workbenchTab === 'editor'"
      class="ann-workbench-form"
      role="tabpanel"
      aria-label="Message editor"
    >
      <section class="ann-panel">
        <header class="ann-panel-head">
          <div>
            <h2>Content</h2>
            <p>What staff see on the full-screen login gate.</p>
          </div>
          <label class="ann-toggle">
            <input v-model="form.isActive" type="checkbox">
            <span>{{ form.isActive ? 'Active' : 'Inactive' }}</span>
          </label>
        </header>

        <div class="ann-fields">
          <label class="fld">
            <span>Title</span>
            <input v-model="form.title" type="text" maxlength="200" placeholder="Important update">
          </label>
          <label class="fld">
            <span>Subtitle</span>
            <input v-model="form.subtitle" type="text" maxlength="300" placeholder="Optional supporting line">
          </label>

          <div class="fld ann-fld">
            <span>Hero image</span>
            <div class="ann-hero-row">
              <div v-if="form.heroImageUrl" class="ann-hero-thumb">
                <img :src="form.heroImageUrl" alt="">
                <button type="button" class="btn sm" @click="emit('clear-hero')">Remove</button>
              </div>
              <label
                class="btn sm ann-upload"
                :class="{ disabled: uploadBusy }"
              >
                {{ uploadBusy ? 'Uploading…' : form.heroImageUrl ? 'Replace image' : 'Upload image' }}
                <input type="file" accept="image/*" :disabled="uploadBusy" @change="onHeroInput">
              </label>
            </div>
          </div>

          <!--
            Body must NOT be a <label>: wrapping the rich editor in a label makes
            clicks activate the first toolbar button (Undo), which deletes the
            last character typed in Title/Subtitle via the document undo stack.
          -->
          <div class="fld ann-fld">
            <span>Body</span>
            <AnnouncementRichEditor
              v-model="form.bodyHtml"
              :announcement-id="announcementId"
              :ensure-announcement-id="ensureAnnouncementId"
              @update:announcement-id="emit('update:announcementId', $event)"
              @error="emit('error', $event)"
            />
          </div>
        </div>
      </section>

      <section class="ann-panel">
        <header class="ann-panel-head">
          <div>
            <h2>Delivery</h2>
            <p>Active messages show on every staff login while within the schedule window.</p>
          </div>
        </header>
        <div class="ann-fields ann-fields-3">
          <label class="fld">
            <span>Priority</span>
            <input v-model.number="form.priority" type="number" min="-1000" max="1000">
            <span class="help">Lower number shows first (1 before 2) when multiple messages are pending.</span>
          </label>
          <label class="fld">
            <span>Starts</span>
            <input v-model="form.startsAt" type="datetime-local">
          </label>
          <label class="fld">
            <span>Ends</span>
            <input v-model="form.endsAt" type="datetime-local">
          </label>
        </div>
      </section>

      <section class="ann-panel">
        <header class="ann-panel-head">
          <div>
            <h2>Audience</h2>
            <p>Who must see this before the dashboard.</p>
          </div>
        </header>

        <div class="ann-audience-modes" role="radiogroup" aria-label="Audience">
          <label class="ann-mode" :class="{ on: form.audienceMode === 'all' }">
            <input v-model="form.audienceMode" type="radio" value="all">
            <strong>All staff</strong>
            <span>Everyone except customer portal accounts</span>
          </label>
          <label class="ann-mode" :class="{ on: form.audienceMode === 'account_type' }">
            <input v-model="form.audienceMode" type="radio" value="account_type">
            <strong>Account types</strong>
            <span>Managers, mechanics, custom roles…</span>
          </label>
          <label class="ann-mode" :class="{ on: form.audienceMode === 'user' }">
            <input v-model="form.audienceMode" type="radio" value="user">
            <strong>Specific users</strong>
            <span>Hand-pick individual staff</span>
          </label>
        </div>

        <div v-if="form.audienceMode === 'account_type'" class="ann-chips">
          <label
            v-for="type in accountTypes"
            :key="type.key"
            class="ann-chip"
            :class="{ on: form.accountTypeKeys.includes(type.key) }"
          >
            <input
              type="checkbox"
              :checked="form.accountTypeKeys.includes(type.key)"
              @change="toggleType(type.key)"
            >
            {{ type.name || accountTypeLabel(type.key) }}
          </label>
        </div>

        <div v-if="form.audienceMode === 'user'" class="ann-users">
          <input
            v-model="userFilter"
            type="search"
            placeholder="Filter by name or email…"
            class="ann-user-filter"
          >
          <label
            v-for="user in filteredUsers"
            :key="user.id"
            class="ann-user-row"
          >
            <input
              type="checkbox"
              :checked="form.userIds.includes(user.id)"
              @change="toggleUser(user.id)"
            >
            <span>
              <b>{{ user.name }}</b>
              <span class="help">{{ user.email }} · {{ accountTypeLabel(user.accountType) }}</span>
            </span>
          </label>
          <p v-if="!filteredUsers.length" class="help ann-users-empty">No users match.</p>
        </div>
      </section>

    </div>

    <div
      v-show="workbenchTab === 'preview'"
      class="ann-workbench-preview"
      role="tabpanel"
      aria-label="Login message preview"
    >
      <div class="ann-preview-bar">
        <div>
          <h2>Preview</h2>
          <p>Exact login-gate layout staff will see after sign-in.</p>
        </div>
        <button type="button" class="btn sm" @click="previewFullscreen = true">
          Full screen
        </button>
      </div>

      <div class="ann-preview-stage ann-login-bg" aria-label="Login message preview">
        <AnnouncementGateCard
          compact
          :title="form.title"
          :subtitle="form.subtitle"
          :body-html="form.bodyHtml"
          :hero-image-url="form.heroImageUrl"
          :continue-label="continueLabel"
          :continue-disabled="true"
        />
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="previewFullscreen"
        class="ann-preview-fs ann-login-bg"
        role="dialog"
        aria-label="Full screen login message preview"
        @click.self="previewFullscreen = false"
      >
        <button type="button" class="btn ann-preview-fs-close" @click="previewFullscreen = false">
          Close preview
        </button>
        <AnnouncementGateCard
          :title="form.title"
          :subtitle="form.subtitle"
          :body-html="form.bodyHtml"
          :hero-image-url="form.heroImageUrl"
          :continue-label="continueLabel"
          :continue-disabled="true"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ann-workbench {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.ann-workbench-tabs {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  gap: 4px;
  padding: 4px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.ann-tab {
  appearance: none;
  border: 0;
  background: transparent;
  color: #64748b;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.ann-tab:hover {
  color: #0f172a;
  background: #fff;
}

.ann-tab.on {
  color: #0f172a;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.ann-workbench-form {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.ann-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px 18px 18px;
}

.ann-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.ann-panel-head h2 {
  margin: 0;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}

.ann-panel-head p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}

.ann-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 600;
  background: #f8fafc;
  white-space: nowrap;
}

.ann-fields {
  display: grid;
  gap: 12px;
}

.ann-fld {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 0;
}

.ann-fld > span {
  display: block;
  margin-bottom: 6px;
}

.ann-fields-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ann-hero-row {
  display: grid;
  gap: 8px;
}

.ann-hero-thumb {
  display: grid;
  gap: 8px;
  justify-items: start;
}

.ann-hero-thumb img {
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.ann-upload {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  width: fit-content;
}

.ann-upload.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.ann-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.ann-audience-modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.ann-mode {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  cursor: pointer;
  min-height: 96px;
}

.ann-mode input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.ann-mode strong {
  font-size: 14px;
}

.ann-mode span {
  font-size: 12px;
  color: #64748b;
  line-height: 1.35;
}

.ann-mode.on {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.25);
}

.ann-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ann-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 13px;
  background: #fff;
}

.ann-chip.on {
  border-color: #2563eb;
  background: #eff6ff;
}

.ann-users {
  margin-top: 12px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}

.ann-user-filter {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 12px;
}

.ann-user-row {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}

.ann-users-empty {
  padding: 12px;
}

.ann-workbench-preview {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  min-width: 0;
}

.ann-preview-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}

.ann-preview-bar h2 {
  margin: 0;
  font-size: 1rem;
  color: #0f172a;
}

.ann-preview-bar p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}

.ann-preview-stage {
  display: grid;
  place-items: center;
  padding: 28px 20px;
  min-height: 560px;
}

.ann-preview-fs {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 24px 16px;
}

.ann-preview-fs-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  border-color: #cbd5e1;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

@media (max-width: 900px) {
  .ann-fields-3,
  .ann-audience-modes {
    grid-template-columns: 1fr;
  }
}
</style>
