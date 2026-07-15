<script setup lang="ts">
import type { CatalogKeywordMap } from '#shared/workspace-settings-defaults'
import { DEFAULT_CATALOG_CATEGORIES } from '#shared/catalog-default-categories'
import { reloadDetectionSettings } from '~/composables/useDetectionSettings'

const emit = defineEmits<{ saved: [] }>()

const { data, refresh, pending } = useClientFetch<{ keywords: CatalogKeywordMap }>('/api/admin/settings/catalog-detection')

const editors = reactive<Record<string, string>>({})

function keywordsToText(words: string[]): string {
  return words.join('\n')
}

function textToKeywords(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

watch(() => data.value?.keywords, (map) => {
  if (!map) return
  for (const name of DEFAULT_CATALOG_CATEGORIES) {
    editors[name] = keywordsToText(map[name] ?? [])
  }
  for (const [name, words] of Object.entries(map)) {
    if (!(name in editors)) editors[name] = keywordsToText(words)
  }
}, { immediate: true })

const busy = ref(false)
const message = ref('')
const error = ref('')
const expanded = ref<string | null>(DEFAULT_CATALOG_CATEGORIES[0] ?? null)

async function save() {
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    const keywords: CatalogKeywordMap = {}
    for (const [name, text] of Object.entries(editors)) {
      const words = textToKeywords(text)
      if (words.length) keywords[name] = words
    }
    await $fetch('/api/admin/settings/catalog-detection', {
      method: 'PATCH',
      body: { keywords },
    })
    message.value = 'Catalog detection dictionary saved'
    await refresh()
    await reloadDetectionSettings()
    emit('saved')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Catalog auto-detection</h3>
      <p>Keyword lists used to suggest a category when adding catalog items. One keyword or phrase per line.</p>
    </header>

    <div v-if="pending" class="card"><div class="cbody">Loading…</div></div>

    <form v-else class="card" @submit.prevent="save">
      <div class="cbody settings-form">
        <details
          v-for="name in DEFAULT_CATALOG_CATEGORIES"
          :key="name"
          class="cat-kw"
          :open="expanded === name"
          @toggle="expanded = ($event.target as HTMLDetailsElement).open ? name : null"
        >
          <summary>{{ name }}</summary>
          <textarea
            v-model="editors[name]"
            rows="4"
            :aria-label="`Keywords for ${name}`"
            placeholder="One keyword per line"
          />
        </details>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save catalog dictionary' }}</button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
@import './settings-panel.css';
.cat-kw {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.cat-kw summary {
  cursor: pointer;
  padding: 10px 12px;
  font-weight: 600;
  font-size: 13.5px;
  color: #334155;
}
.cat-kw textarea {
  width: 100%;
  box-sizing: border-box;
  border: none;
  border-top: 1px solid #e2e8f0;
  border-radius: 0 0 10px 10px;
  padding: 10px 12px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  resize: vertical;
  min-height: 80px;
}
</style>
