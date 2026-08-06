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
  hasHtmlSource: boolean
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
  baselineHtml: string
  hasHtmlSource: boolean
  variables: Array<{ key: string, label: string }>
  sampleVars: Record<string, string>
  updatedAt: string
}

type EditorTab = 'html' | 'content' | 'preview'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const canRead = computed(() => auth.loaded && auth.can('templates.read.all'))
const canManage = computed(() => auth.loaded && auth.can('templates.manage.all'))

const selectedTypeKey = ref<string | null>(null)
const editorTab = ref<EditorTab>('html')
const htmlEditorRef = ref<HTMLTextAreaElement | null>(null)

const form = reactive<EmailTemplateContent>({
  subject: '',
  eyebrow: '',
  headline: '',
  lead: '',
  noteTitle: '',
  noteBody: '',
  primaryActionLabel: '',
  htmlSource: '',
})
const savedForm = reactive<EmailTemplateContent>({ ...form })
const baselineHtml = ref('')
const htmlEditor = ref('')
const savedHtmlEditor = ref('')

const saveBusy = ref(false)
const activateBusy = ref(false)
const resetBusy = ref(false)
const previewBusy = ref(false)
const actionError = ref('')
const actionMessage = ref('')
const previewHtml = ref('')
const previewSubject = ref('')
const usedHtmlSource = ref(false)

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
  || form.primaryActionLabel !== savedForm.primaryActionLabel
  || htmlEditor.value !== savedHtmlEditor.value,
)

const filteredItems = computed(() => {
  const items = listData.value?.items ?? []
  if (groupFilter.value === 'all') return items
  return items.filter(i => i.group === groupFilter.value)
})

const customHtmlActive = computed(() => Boolean(htmlEditor.value.trim()))

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

function hydrateFromDetail(detail: TemplateDetail) {
  Object.assign(form, {
    ...detail.content,
    htmlSource: detail.content.htmlSource ?? '',
  })
  Object.assign(savedForm, {
    ...detail.content,
    htmlSource: detail.content.htmlSource ?? '',
  })
  baselineHtml.value = detail.baselineHtml || ''
  const source = (detail.content.htmlSource || '').trim() || detail.baselineHtml || ''
  htmlEditor.value = source
  savedHtmlEditor.value = source
  previewHtml.value = ''
  previewSubject.value = ''
  actionError.value = ''
  actionMessage.value = ''
}

watch(data, (detail) => {
  if (!detail) return
  hydrateFromDetail(detail)
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

function currentContentPayload(): EmailTemplateContent {
  return {
    subject: form.subject,
    eyebrow: form.eyebrow,
    headline: form.headline,
    lead: form.lead,
    noteTitle: form.noteTitle,
    noteBody: form.noteBody,
    primaryActionLabel: form.primaryActionLabel,
    // Persist raw HTML only when it differs from the generated baseline.
    htmlSource: htmlEditor.value.trim() === baselineHtml.value.trim()
      ? ''
      : htmlEditor.value,
  }
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
        content: currentContentPayload(),
        activate: opts?.activate,
      },
    })
    hydrateFromDetail(detail)
    actionMessage.value = opts?.activate
      ? 'Template saved and set active'
      : 'Template saved'
    await refreshList()
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
    const detail = await $fetch<TemplateDetail>(
      `/api/email-templates/${selectedTypeKey.value}/${nextActive ? 'activate' : 'deactivate'}`,
      { method: 'POST' },
    )
    hydrateFromDetail(detail)
    actionMessage.value = nextActive
      ? 'Active template enabled — outbound mail uses this content'
      : 'Template deactivated — system defaults are used'
    await refreshList()
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
    hydrateFromDetail(detail)
    actionMessage.value = 'Reset to system defaults'
    await refreshList()
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
    const result = await $fetch<{ subject: string, html: string, usedHtmlSource?: boolean }>(
      `/api/email-templates/${selectedTypeKey.value}/preview`,
      {
        method: 'POST',
        body: { content: currentContentPayload() },
      },
    )
    if (requestId !== previewRequestId) return
    previewSubject.value = result.subject
    previewHtml.value = result.html
    usedHtmlSource.value = Boolean(result.usedHtmlSource)
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
  const token = variableToken(key)
  if (editorTab.value === 'html' && htmlEditorRef.value) {
    const el = htmlEditorRef.value
    const start = el.selectionStart
    const end = el.selectionEnd
    htmlEditor.value = `${htmlEditor.value.slice(0, start)}${token}${htmlEditor.value.slice(end)}`
    nextTick(() => {
      const caret = start + token.length
      el.focus()
      el.setSelectionRange(caret, caret)
    })
    return
  }
  form.lead = `${form.lead}${token}`
}

function loadBaselineHtml() {
  if (!canManage.value) return
  if (htmlEditor.value.trim() && htmlEditor.value !== baselineHtml.value) {
    if (!confirm('Replace the HTML editor with the generated baseline from content fields?')) return
  }
  htmlEditor.value = baselineHtml.value || ''
  actionMessage.value = 'Loaded generated HTML baseline'
  actionError.value = ''
}

async function rebuildBaselineFromContent() {
  if (!canManage.value || !selectedTypeKey.value) return
  try {
    const result = await $fetch<{ html: string }>(
      `/api/email-templates/${selectedTypeKey.value}/preview`,
      {
        method: 'POST',
        body: {
          content: {
            ...form,
            htmlSource: '',
          },
        },
      },
    )
    baselineHtml.value = result.html
    htmlEditor.value = result.html
    actionMessage.value = 'Rebuilt HTML from content fields'
    actionError.value = ''
    editorTab.value = 'html'
  }
  catch (e: unknown) {
    actionError.value = fetchErrorMessage(e, 'Could not rebuild HTML from content')
  }
}

async function copyHtml() {
  try {
    await navigator.clipboard.writeText(htmlEditor.value)
    actionMessage.value = 'HTML copied'
    actionError.value = ''
  }
  catch {
    actionError.value = 'Could not copy — allow clipboard access in your browser'
  }
}

async function pasteHtml() {
  if (!canManage.value) return
  try {
    const text = await navigator.clipboard.readText()
    if (!text) return
    const el = htmlEditorRef.value
    if (el) {
      const start = el.selectionStart
      const end = el.selectionEnd
      htmlEditor.value = `${htmlEditor.value.slice(0, start)}${text}${htmlEditor.value.slice(end)}`
      await nextTick()
      const caret = start + text.length
      el.focus()
      el.setSelectionRange(caret, caret)
    }
    else {
      htmlEditor.value = text
    }
    actionMessage.value = 'Pasted from clipboard'
    actionError.value = ''
  }
  catch {
    actionError.value = 'Could not paste — allow clipboard access in your browser'
  }
}

function resetHtmlToSaved() {
  htmlEditor.value = savedHtmlEditor.value
}
</script>

<template>
  <div v-if="!auth.loaded" class="cp-state">Loading email template editor…</div>
  <div v-else-if="!canRead" class="cp-state">You do not have permission to view email templates.</div>
  <div v-else-if="listPending && !listData" class="cp-state">Loading email template editor…</div>
  <div v-else-if="listError" class="cp-state">{{ loadErrorMessage }}</div>
  <div v-else-if="!selectedTypeKey" class="cp-state">No email templates found.</div>

  <div v-else class="ete">
    <aside class="card ete-rail" aria-label="Email types">
      <div class="ete-rail__head">
        <div>
          <h3>Email types</h3>
          <p>Pick a template to edit its HTML.</p>
        </div>
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
        class="ete-rail__item"
        :class="{ on: item.typeKey === selectedTypeKey }"
        @click="selectType(item.typeKey)"
      >
        <span class="ete-rail__name">{{ item.name }}</span>
        <span class="ete-rail__meta">
          <span class="pill" :class="item.isActive ? 'ok' : ''">{{ item.isActive ? 'Active' : 'Default' }}</span>
          <span v-if="item.hasHtmlSource" class="pill indigo">HTML</span>
          <span class="ete-rail__group">{{ groupLabel(item.group) }}</span>
        </span>
      </button>
    </aside>

    <div class="ete-main">
      <div v-if="pending && !data" class="cp-state">Loading template…</div>
      <div v-else-if="error || !data" class="cp-state">{{ loadErrorMessage }}</div>
      <template v-else>
        <div class="card ete-toolbar">
          <div class="ete-toolbar__copy">
            <h3>{{ data.name }}</h3>
            <p>{{ data.description }}</p>
            <div class="ete-badges">
              <span class="pill indigo">{{ audienceLabel(data.audience) }}</span>
              <span class="pill" :class="data.isActive ? 'ok' : ''">
                {{ data.isActive ? 'Active custom template' : 'System default until activated' }}
              </span>
              <span v-if="customHtmlActive" class="pill indigo">Raw HTML</span>
              <span v-if="dirty" class="pill">Unsaved</span>
            </div>
          </div>
          <div class="ete-toolbar__actions">
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
              {{ resetBusy ? 'Resetting…' : 'Reset' }}
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
        </div>

        <p v-if="actionError" class="ete-msg ete-msg--err">{{ actionError }}</p>
        <p v-if="actionMessage" class="ete-msg ete-msg--ok">{{ actionMessage }}</p>

        <div class="card ete-workspace">
          <div class="ete-workspace__head">
            <div class="ete-tabs" role="tablist">
              <button
                type="button"
                class="ete-tab"
                :class="{ active: editorTab === 'html' }"
                @click="editorTab = 'html'"
              >
                HTML code
              </button>
              <button
                type="button"
                class="ete-tab"
                :class="{ active: editorTab === 'content' }"
                @click="editorTab = 'content'"
              >
                Content fields
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
            <div class="ete-workspace__actions">
              <template v-if="editorTab === 'html'">
                <button type="button" class="btn sm ghost" :disabled="!htmlEditor" @click="copyHtml">Copy</button>
                <button v-if="canManage" type="button" class="btn sm ghost" @click="pasteHtml">Paste</button>
                <button
                  v-if="canManage"
                  type="button"
                  class="btn sm ghost"
                  :disabled="htmlEditor === savedHtmlEditor"
                  @click="resetHtmlToSaved"
                >
                  Reset
                </button>
                <button v-if="canManage" type="button" class="btn sm ghost" @click="loadBaselineHtml">
                  Load baseline
                </button>
              </template>
              <template v-else-if="editorTab === 'content'">
                <button v-if="canManage" type="button" class="btn sm ghost" @click="rebuildBaselineFromContent">
                  Rebuild HTML from fields
                </button>
              </template>
              <template v-else>
                <button type="button" class="btn sm" :disabled="previewBusy" @click="refreshPreview">
                  {{ previewBusy ? 'Rendering…' : 'Refresh preview' }}
                </button>
              </template>
            </div>
          </div>

          <div v-show="editorTab === 'html'" class="ete-pane ete-pane--code">
            <textarea
              ref="htmlEditorRef"
              v-model="htmlEditor"
              class="td-code ete-html-editor"
              spellcheck="false"
              :disabled="!canManage"
              aria-label="Email template HTML source"
            />
            <div class="ete-pane__footer">
              <p>
                Edit the full HTML document. Use tokens like <code>{{ variableToken('name') }}</code>.
                Saving a customized document makes it the active body when the template is activated.
                <span v-if="dirty" class="dirty">Unsaved changes.</span>
              </p>
              <div v-if="data.variables.length" class="ete-vars-inline">
                <button
                  v-for="variable in data.variables"
                  :key="variable.key"
                  type="button"
                  class="ete-chip"
                  :disabled="!canManage"
                  :title="variable.label"
                  @click="insertVariable(variable.key)"
                >
                  {{ variableToken(variable.key) }}
                </button>
              </div>
            </div>
          </div>

          <div v-show="editorTab === 'content'" class="ete-pane ete-pane--fields">
            <div class="ete-form">
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
              <p class="ete-hint">
                Content fields drive the generated baseline layout.
                Use <b>Rebuild HTML from fields</b> to refresh the code editor from these values.
              </p>
            </div>
          </div>

          <div v-show="editorTab === 'preview'" class="ete-pane ete-pane--preview">
            <div class="ete-preview__toolbar">
              <span class="ete-preview__subject">Subject: {{ previewSubject || '—' }}</span>
              <span v-if="usedHtmlSource" class="pill indigo">Using raw HTML</span>
              <span v-else class="pill">Using generated layout</span>
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
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ete {
  display: grid;
  grid-template-columns: minmax(220px, 270px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.ete-rail {
  padding: 0;
  overflow: hidden;
  max-height: calc(100vh - 180px);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 12px;
}
.ete-rail__head {
  padding: 14px;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ete-rail__head h3 { margin: 0; font-size: 14px; color: #0f172a; }
.ete-rail__head p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
.ete-rail__head select {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 10px;
  background: #fff;
  color: #0f172a;
}
.ete-rail__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: transparent;
  cursor: pointer;
  color: inherit;
}
.ete-rail__item:hover { background: #f8fafc; }
.ete-rail__item.on {
  background: #eef2ff;
  box-shadow: inset 3px 0 0 #4f46e5;
}
.ete-rail__name { font-weight: 650; font-size: 13px; color: #0f172a; }
.ete-rail__meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ete-rail__group { font-size: 11px; color: #64748b; }
.ete-main { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ete-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 16px;
  background:
    radial-gradient(1200px 180px at 0% 0%, rgba(79, 70, 229, 0.08), transparent 60%),
    #fff;
}
.ete-toolbar__copy h3 { margin: 0 0 4px; font-size: 18px; color: #0f172a; }
.ete-toolbar__copy p { margin: 0; color: #64748b; font-size: 13px; max-width: 56ch; line-height: 1.45; }
.ete-toolbar__actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; }
.ete-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.ete-workspace { padding: 0; overflow: hidden; }
.ete-workspace__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 0 8px 0 4px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}
.ete-tabs { display: flex; gap: 2px; padding: 6px; }
.ete-tab {
  border: 0;
  background: transparent;
  padding: 10px 14px;
  cursor: pointer;
  color: #64748b;
  border-radius: 8px;
  font-weight: 600;
  font-size: 13px;
}
.ete-tab:hover { background: #fff; color: #0f172a; }
.ete-tab.active {
  background: #fff;
  color: #4f46e5;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.ete-workspace__actions { display: flex; gap: 6px; flex-wrap: wrap; padding: 8px; }
.ete-pane--code { display: flex; flex-direction: column; min-height: 560px; }
.ete-html-editor {
  min-height: 520px;
  border-radius: 0;
}
.ete-pane__footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}
.ete-pane__footer p {
  margin: 0;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.45;
}
.ete-pane__footer .dirty { color: #d97706; }
.ete-vars-inline { display: flex; flex-wrap: wrap; gap: 6px; }
.ete-chip {
  appearance: none;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  padding: 4px 9px;
  color: #475569;
  cursor: pointer;
}
.ete-chip:hover:not(:disabled) {
  border-color: #c7d2fe;
  color: #4f46e5;
  background: #eef2ff;
}
.ete-chip:disabled { opacity: 0.55; cursor: not-allowed; }
.ete-pane--fields { padding: 16px; }
.ete-form { display: flex; flex-direction: column; gap: 12px; max-width: 920px; }
.ete-form__row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ete-form .fld { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #334155; }
.ete-form input,
.ete-form textarea {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
  color: #0f172a;
}
.ete-form input:focus,
.ete-form textarea:focus {
  outline: none;
  border-color: #a5b4fc;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
}
.ete-hint { margin: 0; font-size: 12.5px; color: #64748b; line-height: 1.45; }
.ete-msg { margin: 0; font-size: 13px; }
.ete-msg--err { color: #b91c1c; }
.ete-msg--ok { color: #047857; }
.ete-pane--preview { display: flex; flex-direction: column; gap: 0; min-height: 560px; }
.ete-preview__toolbar {
  display: flex;
  justify-content: flex-start;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.ete-preview__subject { font-size: 13px; color: #334155; font-weight: 600; }
.ete-preview__frame {
  width: 100%;
  min-height: 560px;
  border: 0;
  background: #fff;
}
.ete-preview__loading,
.ete-preview__empty {
  margin: 0;
  padding: 48px 16px;
  text-align: center;
  color: #64748b;
}
@media (max-width: 960px) {
  .ete { grid-template-columns: 1fr; }
  .ete-rail {
    position: static;
    max-height: 260px;
  }
  .ete-form__row { grid-template-columns: 1fr; }
  .ete-html-editor { min-height: 420px; }
}
</style>
