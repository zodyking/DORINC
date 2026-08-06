<script setup lang="ts">
import type { EmailTemplateContent } from '#shared/email-template-catalog'
import { fetchErrorMessage } from '~/utils/fetch-blob-error'

interface TemplateListItem {
  typeKey: string
  name: string
  description: string
  audience: string
  group: string
  isActive: boolean
  updatedAt: string | null
  hasCustomContent: boolean
}

interface TemplateDetail {
  typeKey: string
  name: string
  description: string
  audience: string
  group: string
  isActive: boolean
  content: EmailTemplateContent
  defaults: EmailTemplateContent
  variables: Array<{ key: string, label: string }>
  sampleVars: Record<string, string>
  updatedAt: string
}

type EditorTab = 'edit' | 'preview'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const canRead = computed(() => auth.loaded && auth.can('templates.read.all'))
const canManage = computed(() => auth.loaded && auth.can('templates.manage.all'))

const selectedTypeKey = ref<string | null>(null)
const editorTab = ref<EditorTab>('edit')
const form = reactive<EmailTemplateContent>({
  subject: '',
  eyebrow: '',
  headline: '',
  lead: '',
  noteTitle: '',
  noteBody: '',
  primaryActionLabel: '',
})
const savedForm = reactive<EmailTemplateContent>({ ...form })

const saveBusy = ref(false)
const activateBusy = ref(false)
const resetBusy = ref(false)
const previewBusy = ref(false)
const actionError = ref('')
const actionMessage = ref('')
const previewHtml = ref('')
const previewSubject = ref('')

const groupFilter = ref<'all' | 'security' | 'customer' | 'workflow' | 'system'>('all')

const { data: listData, pending: listPending, error: listError, refresh: refreshList } = useFetch<{ items: TemplateListItem[] }>(
  '/api/email-templates',
  { server: false, lazy: true, immediate: false },
)

const { data, refresh, pending, error } = useFetch<TemplateDetail>(
  () => selectedTypeKey.value ? `/api/email-templates/${selectedTypeKey.value}` : null,
  { watch: [selectedTypeKey], server: false, lazy: true, immediate: false },
)

const dirty = computed(() =>
  form.subject !== savedForm.subject
  || form.eyebrow !== savedForm.eyebrow
  || form.headline !== savedForm.headline
  || form.lead !== savedForm.lead
  || form.noteTitle !== savedForm.noteTitle
  || form.noteBody !== savedForm.noteBody
  || form.primaryActionLabel !== savedForm.primaryActionLabel,
)

const filteredItems = computed(() => {
  const items = listData.value?.items ?? []
  if (groupFilter.value === 'all') return items
  return items.filter(i => i.group === groupFilter.value)
})

watch(canRead, (allowed) => {
  if (allowed) refreshList()
}, { immediate: true })

watch(listData, (list) => {
  if (!list?.items.length) return
  const fromQuery = route.query.type as string | undefined
  if (fromQuery && list.items.some(t => t.typeKey === fromQuery)) {
    selectedTypeKey.value = fromQuery
  }
  else if (!selectedTypeKey.value) {
    selectedTypeKey.value = list.items[0]?.typeKey ?? null
  }
}, { immediate: true })

watch(selectedTypeKey, async (key) => {
  if (!key) return
  await refresh()
  if (route.query.type !== key) {
    await router.replace({ path: '/templates/email', query: { type: key } })
  }
})

watch(data, (detail) => {
  if (!detail) return
  Object.assign(form, detail.content)
  Object.assign(savedForm, detail.content)
  previewHtml.value = ''
  previewSubject.value = ''
  actionError.value = ''
  actionMessage.value = ''
  if (editorTab.value === 'preview') void refreshPreview()
}, { immediate: true })

const loadErrorMessage = computed(() => {
  const err = (error.value ?? listError.value) as { data?: { message?: string }, message?: string } | null
  return err?.data?.message ?? err?.message ?? 'Could not load email templates.'
})

async function selectType(typeKey: string) {
  if (typeKey === selectedTypeKey.value) return
  if (dirty.value && !confirm('You have unsaved changes. Switch template anyway?')) return
  selectedTypeKey.value = typeKey
}

function applyContent(content: EmailTemplateContent) {
  Object.assign(form, content)
}

async function saveTemplate(opts?: { activate?: boolean }) {
  if (!canManage.value || !selectedTypeKey.value) return
  saveBusy.value = true
  actionError.value = ''
  actionMessage.value = ''
  try {
    const detail = await $fetch<TemplateDetail>(`/api/email-templates/${selectedTypeKey.value}`, {
      method: 'PATCH',
      body: {
        content: { ...form },
        activate: opts?.activate,
      },
    })
    Object.assign(form, detail.content)
    Object.assign(savedForm, detail.content)
    actionMessage.value = opts?.activate
      ? 'Template saved and set active'
      : 'Template saved'
    await refreshList()
    await refresh()
  }
  catch (e: unknown) {
    actionError.value = fetchErrorMessage(e, 'Could not save email template')
  }
  finally {
    saveBusy.value = false
  }
}

async function toggleActive() {
  if (!canManage.value || !selectedTypeKey.value || !data.value) return
  activateBusy.value = true
  actionError.value = ''
  actionMessage.value = ''
  const nextActive = !data.value.isActive
  try {
    await $fetch(`/api/email-templates/${selectedTypeKey.value}/${nextActive ? 'activate' : 'deactivate'}`, {
      method: 'POST',
    })
    actionMessage.value = nextActive
      ? 'Active template enabled — outbound mail uses this content'
      : 'Template deactivated — system defaults are used'
    await refreshList()
    await refresh()
  }
  catch (e: unknown) {
    actionError.value = fetchErrorMessage(e, 'Could not update active state')
  }
  finally {
    activateBusy.value = false
  }
}

async function resetTemplate() {
  if (!canManage.value || !selectedTypeKey.value) return
  if (!confirm('Reset this template to system defaults and deactivate it?')) return
  resetBusy.value = true
  actionError.value = ''
  actionMessage.value = ''
  try {
    const detail = await $fetch<TemplateDetail>(`/api/email-templates/${selectedTypeKey.value}/reset`, {
      method: 'POST',
    })
    Object.assign(form, detail.content)
    Object.assign(savedForm, detail.content)
    actionMessage.value = 'Reset to system defaults'
    await refreshList()
    await refresh()
  }
  catch (e: unknown) {
    actionError.value = fetchErrorMessage(e, 'Could not reset template')
  }
  finally {
    resetBusy.value = false
  }
}

let previewRequestId = 0

async function refreshPreview() {
  if (!canRead.value || !selectedTypeKey.value) return
  const requestId = ++previewRequestId
  previewBusy.value = true
  actionError.value = ''
  try {
    const result = await $fetch<{ subject: string, html: string }>(
      `/api/email-templates/${selectedTypeKey.value}/preview`,
      {
        method: 'POST',
        body: { content: { ...form } },
      },
    )
    if (requestId !== previewRequestId) return
    previewSubject.value = result.subject
    previewHtml.value = result.html
  }
  catch (e: unknown) {
    if (requestId !== previewRequestId) return
    actionError.value = fetchErrorMessage(e, 'Could not render preview')
  }
  finally {
    if (requestId === previewRequestId) previewBusy.value = false
  }
}

watch(editorTab, (tab) => {
  if (tab === 'preview') void refreshPreview()
})

function audienceLabel(audience: string) {
  if (audience === 'customer') return 'Customer'
  if (audience === 'staff') return 'Staff'
  return 'System'
}

function groupLabel(group: string) {
  if (group === 'security') return 'Security'
  if (group === 'customer') return 'Customer'
  if (group === 'workflow') return 'Workflow'
  return 'System'
}

function variableToken(key: string) {
  return `{{${key}}}`
}

function insertVariable(key: string) {
  form.lead = `${form.lead}${variableToken(key)}`
}
</script>

<template>
  <div v-if="!auth.loaded" class="cp-state">Loading email template editor…</div>
  <div v-else-if="!canRead" class="cp-state">You do not have permission to view email templates.</div>
  <div v-else-if="listPending && !listData" class="cp-state">Loading email template editor…</div>
  <div v-else-if="listError" class="cp-state">{{ loadErrorMessage }}</div>
  <div v-else-if="!selectedTypeKey" class="cp-state">No email templates found.</div>

  <div v-else class="ete-page">
    <div class="card ete-layout">
      <aside class="ete-list" aria-label="Email types">
        <div class="ete-list__head">
          <h3>Email types</h3>
          <select v-model="groupFilter" aria-label="Filter by group">
            <option value="all">All groups</option>
            <option value="security">Security</option>
            <option value="customer">Customer</option>
            <option value="workflow">Workflow</option>
            <option value="system">System</option>
          </select>
        </div>
        <button
          v-for="item in filteredItems"
          :key="item.typeKey"
          type="button"
          class="ete-list__item"
          :class="{ on: item.typeKey === selectedTypeKey }"
          @click="selectType(item.typeKey)"
        >
          <span class="ete-list__name">{{ item.name }}</span>
          <span class="ete-list__meta">
            <span class="pill" :class="item.isActive ? 'ok' : ''">{{ item.isActive ? 'Active' : 'Default' }}</span>
            <span class="ete-list__group">{{ groupLabel(item.group) }}</span>
          </span>
        </button>
      </aside>

      <div class="ete-editor">
        <div v-if="pending && !data" class="cp-state">Loading template…</div>
        <div v-else-if="error || !data" class="cp-state">{{ loadErrorMessage }}</div>
        <template v-else>
          <header class="ete-editor__head">
            <div>
              <h3>{{ data.name }}</h3>
              <p>{{ data.description }}</p>
              <div class="ete-badges">
                <span class="pill indigo">{{ audienceLabel(data.audience) }}</span>
                <span class="pill" :class="data.isActive ? 'ok' : ''">
                  {{ data.isActive ? 'Active custom template' : 'Using system default until activated' }}
                </span>
              </div>
            </div>
            <div class="ete-editor__actions">
              <button
                v-if="canManage"
                type="button"
                class="btn"
                :disabled="activateBusy"
                @click="toggleActive"
              >
                {{ activateBusy ? 'Updating…' : (data.isActive ? 'Deactivate' : 'Set active') }}
              </button>
              <button
                v-if="canManage"
                type="button"
                class="btn"
                :disabled="resetBusy"
                @click="resetTemplate"
              >
                {{ resetBusy ? 'Resetting…' : 'Reset to default' }}
              </button>
              <button
                v-if="canManage"
                type="button"
                class="btn"
                :disabled="saveBusy || !dirty"
                @click="saveTemplate()"
              >
                {{ saveBusy ? 'Saving…' : 'Save' }}
              </button>
              <button
                v-if="canManage"
                type="button"
                class="btn primary"
                :disabled="saveBusy"
                @click="saveTemplate({ activate: true })"
              >
                {{ saveBusy ? 'Saving…' : 'Save & activate' }}
              </button>
            </div>
          </header>

          <p v-if="actionError" class="ete-msg ete-msg--err">{{ actionError }}</p>
          <p v-if="actionMessage" class="ete-msg ete-msg--ok">{{ actionMessage }}</p>

          <div class="ete-tabs" role="tablist">
            <button
              type="button"
              class="ete-tab"
              :class="{ active: editorTab === 'edit' }"
              @click="editorTab = 'edit'"
            >
              Edit content
            </button>
            <button
              type="button"
              class="ete-tab"
              :class="{ active: editorTab === 'preview' }"
              @click="editorTab = 'preview'"
            >
              Preview
            </button>
          </div>

          <div v-show="editorTab === 'edit'" class="ete-form">
            <label class="fld">
              Subject
              <input v-model="form.subject" type="text" maxlength="300" :disabled="!canManage">
            </label>
            <div class="ete-form__row">
              <label class="fld">
                Eyebrow
                <input v-model="form.eyebrow" type="text" maxlength="120" :disabled="!canManage">
              </label>
              <label class="fld">
                Button label
                <input v-model="form.primaryActionLabel" type="text" maxlength="120" :disabled="!canManage">
              </label>
            </div>
            <label class="fld">
              Headline
              <input v-model="form.headline" type="text" maxlength="200" :disabled="!canManage">
            </label>
            <label class="fld">
              Lead paragraph
              <textarea v-model="form.lead" rows="3" maxlength="2000" :disabled="!canManage" />
            </label>
            <div class="ete-form__row">
              <label class="fld">
                Note title
                <input v-model="form.noteTitle" type="text" maxlength="200" :disabled="!canManage">
              </label>
              <label class="fld">
                Note body
                <textarea v-model="form.noteBody" rows="3" maxlength="4000" :disabled="!canManage" />
              </label>
            </div>

            <div class="ete-vars">
              <h4>Available variables</h4>
              <p>Click a token to append it to the lead paragraph. Preview uses sample values.</p>
              <div class="ete-vars__list">
                <button
                  v-for="variable in data.variables"
                  :key="variable.key"
                  type="button"
                  class="ete-var"
                  :title="`Insert ${variableToken(variable.key)}`"
                  :disabled="!canManage"
                  @click="insertVariable(variable.key)"
                >
                  <code>{{ variableToken(variable.key) }}</code>
                  <span>{{ variable.label }}</span>
                </button>
              </div>
              <button
                v-if="canManage"
                type="button"
                class="btn sm ghost"
                @click="applyContent(data.defaults)"
              >
                Fill from system defaults
              </button>
            </div>
            <p v-if="dirty" class="ete-dirty">Unsaved changes.</p>
          </div>

          <div v-show="editorTab === 'preview'" class="ete-preview">
            <div class="ete-preview__toolbar">
              <span class="ete-preview__subject">Subject: {{ previewSubject || '—' }}</span>
              <button type="button" class="btn sm" :disabled="previewBusy" @click="refreshPreview">
                {{ previewBusy ? 'Rendering…' : 'Refresh preview' }}
              </button>
            </div>
            <div v-if="previewBusy && !previewHtml" class="ete-preview__loading">Rendering preview…</div>
            <iframe
              v-else-if="previewHtml"
              class="ete-preview__frame"
              title="Email template preview"
              sandbox=""
              :srcdoc="previewHtml"
            />
            <p v-else class="ete-preview__empty">Open this tab to render a live preview with sample data.</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ete-page { display: flex; flex-direction: column; gap: 12px; }
.ete-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 0;
  padding: 0;
  overflow: hidden;
  min-height: 640px;
}
.ete-list {
  border-right: 1px solid var(--border, #e5e7eb);
  background: color-mix(in srgb, var(--panel, #fff) 92%, #f3f4f6);
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  overflow: auto;
}
.ete-list__head {
  padding: 14px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: sticky;
  top: 0;
  background: inherit;
  z-index: 1;
}
.ete-list__head h3 { margin: 0; font-size: 14px; }
.ete-list__head select {
  width: 100%;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 8px;
  padding: 6px 8px;
  background: #fff;
}
.ete-list__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  padding: 12px 14px;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--border, #e5e7eb) 70%, transparent);
  background: transparent;
  cursor: pointer;
  color: inherit;
}
.ete-list__item:hover { background: color-mix(in srgb, #2563eb 8%, transparent); }
.ete-list__item.on { background: color-mix(in srgb, #2563eb 12%, transparent); }
.ete-list__name { font-weight: 600; font-size: 13px; }
.ete-list__meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ete-list__group { font-size: 11px; color: #6b7280; }
.ete-editor { padding: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ete-editor__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.ete-editor__head h3 { margin: 0 0 4px; }
.ete-editor__head p { margin: 0; color: #6b7280; font-size: 13px; max-width: 52ch; }
.ete-editor__actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; }
.ete-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.ete-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border, #e5e7eb); }
.ete-tab {
  border: 0;
  background: transparent;
  padding: 10px 14px;
  cursor: pointer;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.ete-tab.active { color: #111827; border-bottom-color: #2563eb; font-weight: 600; }
.ete-form { display: flex; flex-direction: column; gap: 12px; }
.ete-form__row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ete-form .fld { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.ete-form input,
.ete-form textarea {
  border: 1px solid var(--border, #d1d5db);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
}
.ete-vars {
  margin-top: 4px;
  padding: 12px;
  border: 1px dashed var(--border, #d1d5db);
  border-radius: 10px;
  background: #fafafa;
}
.ete-vars h4 { margin: 0 0 4px; font-size: 13px; }
.ete-vars p { margin: 0 0 10px; font-size: 12px; color: #6b7280; }
.ete-vars__list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.ete-var {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  border: 1px solid var(--border, #e5e7eb);
  background: #fff;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  text-align: left;
}
.ete-var code { font-size: 12px; }
.ete-var span { font-size: 11px; color: #6b7280; }
.ete-dirty { margin: 0; color: #b45309; font-size: 12px; }
.ete-msg { margin: 0; font-size: 13px; }
.ete-msg--err { color: #b91c1c; }
.ete-msg--ok { color: #047857; }
.ete-preview { display: flex; flex-direction: column; gap: 10px; min-height: 480px; }
.ete-preview__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.ete-preview__subject { font-size: 13px; color: #374151; }
.ete-preview__frame {
  width: 100%;
  min-height: 520px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  background: #fff;
}
.ete-preview__loading,
.ete-preview__empty {
  margin: 0;
  padding: 40px 16px;
  text-align: center;
  color: #6b7280;
}
@media (max-width: 960px) {
  .ete-layout { grid-template-columns: 1fr; min-height: 0; }
  .ete-list { max-height: 260px; border-right: 0; border-bottom: 1px solid var(--border, #e5e7eb); }
  .ete-form__row { grid-template-columns: 1fr; }
}
</style>
