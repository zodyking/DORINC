<script setup lang="ts">
import type { LineTypeVerbSettings } from '#shared/workspace-settings-defaults'
import { reloadDetectionSettings } from '~/composables/useDetectionSettings'

const emit = defineEmits<{ saved: [] }>()

const { data, refresh, pending } = await useFetch<{ verbs: LineTypeVerbSettings }>('/api/admin/settings/line-detection')

const form = reactive({
  part: '',
  labor: '',
  fee: '',
})

function verbsToText(words: string[]): string {
  return words.join(', ')
}

function textToVerbs(text: string): string[] {
  return text
    .split(/[,\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

watch(() => data.value?.verbs, (v) => {
  if (!v) return
  form.part = verbsToText(v.part)
  form.labor = verbsToText(v.labor)
  form.fee = verbsToText(v.fee)
}, { immediate: true })

const busy = ref(false)
const message = ref('')
const error = ref('')

async function save() {
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    await $fetch('/api/admin/settings/line-detection', {
      method: 'PATCH',
      body: {
        verbs: {
          part: textToVerbs(form.part),
          labor: textToVerbs(form.labor),
          fee: textToVerbs(form.fee),
        },
      },
    })
    message.value = 'Line detection library saved'
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
      <h3>Line type detection</h3>
      <p>First-word verbs that auto-select <b>Part</b>, <b>Labor</b>, or <b>Fee</b> on invoice and service log lines. Comma-separated.</p>
    </header>

    <div v-if="pending" class="card"><div class="cbody">Loading…</div></div>

    <form v-else class="card" @submit.prevent="save">
      <div class="cbody settings-form">
        <label class="fld">
          Part verbs
          <textarea v-model="form.part" rows="3" placeholder="Install, Replace, Swap, …" />
          <span class="help">Example: “Replace mirror” → Part</span>
        </label>
        <label class="fld">
          Labor verbs
          <textarea v-model="form.labor" rows="3" placeholder="Repair, Service, Diagnose, …" />
          <span class="help">Example: “Service engine” → Labor</span>
        </label>
        <label class="fld">
          Fee verbs
          <textarea v-model="form.fee" rows="2" placeholder="Charge, Assess, Apply, …" />
          <span class="help">Example: “Charge shop supplies” → Fee</span>
        </label>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save detection library' }}</button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
@import './settings-panel.css';
textarea {
  font-family: inherit;
  font-size: 13px;
  min-height: 72px;
}
</style>
