<script setup lang="ts">
// Manage catalog categories (mockup: PAGE: CATALOG → Manage categories).

interface CategoryRow {
  id: string
  name: string
  sortOrder: number
}

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ changed: [] }>()

const { data, refresh } = await useFetch<{ items: CategoryRow[] }>('/api/catalog/categories')

const categories = computed(() => data.value?.items ?? [])

const newName = ref('')
const busy = ref(false)
const error = ref('')

function close() {
  open.value = false
  newName.value = ''
  error.value = ''
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string, data?: { message?: string } } })?.data
  return data?.message ?? data?.data?.message ?? fallback
}

async function addCategory() {
  const name = newName.value.trim()
  if (!name) return
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/catalog/categories', { method: 'POST', body: { name } })
    newName.value = ''
    await refresh()
    emit('changed')
  }
  catch (err) {
    error.value = apiErrorMessage(err, 'Could not add category')
  }
  finally {
    busy.value = false
  }
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'cat-cat-scrim') close()
}
</script>

<template>
  <div
    id="cat-cat-scrim"
    class="modal-scrim"
    :class="{ open }"
    :aria-hidden="!open"
    @click="onScrimClick"
  >
    <div class="modal" role="dialog" aria-labelledby="cat-cat-title" aria-modal="true" @click.stop>
      <div class="mhead">
        <div>
          <h3 id="cat-cat-title">Manage categories</h3>
          <p>Group parts, labor, and fees for faster invoice building</p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="close">✕</button>
      </div>
      <div class="mbody">
        <p v-if="error" class="err">{{ error }}</p>
        <form class="add-row" @submit.prevent="addCategory">
          <label class="fld" style="flex:1; margin:0;">
            <span class="sr-only">New category name</span>
            <input v-model="newName" type="text" maxlength="120" placeholder="New category name…" :disabled="busy">
          </label>
          <button type="submit" class="btn primary" :disabled="busy || !newName.trim()">Add</button>
        </form>
        <ul v-if="categories.length" class="cat-list">
          <li v-for="c in categories" :key="c.id">{{ c.name }}</li>
        </ul>
        <div v-else class="empty" style="display:block; margin-top:12px;">No categories yet — add one above.</div>
      </div>
      <div class="mfoot">
        <button type="button" class="btn" @click="close">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.cat-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  max-height: 240px;
  overflow: auto;
}
.cat-list li {
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13.5px;
}
.cat-list li:last-child { border-bottom: none; }
.err {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 13px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
