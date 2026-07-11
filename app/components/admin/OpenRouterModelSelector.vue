<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  apiKey?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [string]
}>()

interface ModelOption {
  id: string
  name: string
  maker: string
  label: string
  promptPerMillion: number | null
  completionPerMillion: number | null
}

const models = ref<ModelOption[]>([])
const loadStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const loadError = ref('')
const query = ref('')
const sortBy = ref<'maker' | 'name' | 'cost'>('maker')
const open = ref(false)
const activeIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listId = useId()
const panelStyle = ref<Record<string, string>>({})

let blurTimer: ReturnType<typeof setTimeout> | null = null

async function loadModels() {
  loadStatus.value = 'loading'
  loadError.value = ''
  try {
    const q = props.apiKey?.trim() ? { apiKey: props.apiKey.trim() } : undefined
    const res = await $fetch<{ models: ModelOption[] }>('/api/admin/ai/models', { query: q })
    models.value = res.models
    loadStatus.value = 'success'
    if (!props.modelValue && res.models[0]) {
      emit('update:modelValue', res.models[0].id)
    }
  }
  catch (e: unknown) {
    loadStatus.value = 'error'
    loadError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load models'
  }
}

function filterAndSortModels(rows: ModelOption[], q: string, sort: typeof sortBy.value): ModelOption[] {
  const needle = q.trim().toLowerCase()
  let filtered = rows
  if (needle) {
    filtered = rows.filter(m =>
      m.id.toLowerCase().includes(needle)
      || m.name.toLowerCase().includes(needle)
      || m.maker.toLowerCase().includes(needle)
      || m.label.toLowerCase().includes(needle),
    )
  }

  const sorted = [...filtered]
  sorted.sort((a, b) => {
    if (sort === 'maker') {
      const maker = a.maker.localeCompare(b.maker)
      return maker !== 0 ? maker : a.name.localeCompare(b.name)
    }
    if (sort === 'cost') {
      const aCost = a.promptPerMillion ?? Number.MAX_SAFE_INTEGER
      const bCost = b.promptPerMillion ?? Number.MAX_SAFE_INTEGER
      return aCost - bCost || a.name.localeCompare(b.name)
    }
    return a.name.localeCompare(b.name)
  })
  return sorted
}

const filteredModels = computed(() =>
  filterAndSortModels(models.value, query.value, sortBy.value),
)

const selectedModel = computed(() => models.value.find(m => m.id === props.modelValue) ?? null)

const inputPlaceholder = computed(() => {
  if (loadStatus.value === 'loading') return 'Loading models…'
  if (!models.value.length) return 'Load models from OpenRouter to search…'
  return 'Search by maker, name, or id…'
})

const showList = computed(() =>
  open.value
  && !props.disabled
  && loadStatus.value !== 'loading'
  && models.value.length > 0,
)

const listEmptyMessage = computed(() => {
  if (!models.value.length) return ''
  if (!filteredModels.value.length) return `No models match “${query.value.trim()}”.`
  return ''
})

function updatePanelPosition() {
  const el = inputEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = Math.max(rect.width, 320)
  const left = Math.min(rect.left, window.innerWidth - width - 8)
  panelStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + 4)}px`,
    left: `${Math.round(Math.max(8, left))}px`,
    width: `${Math.round(width)}px`,
  }
}

function openPicker() {
  if (props.disabled) return
  open.value = true
  activeIndex.value = filteredModels.value.length ? 0 : -1
  updatePanelPosition()
}

function closePicker() {
  open.value = false
  query.value = ''
  activeIndex.value = 0
}

function pick(model: ModelOption) {
  if (blurTimer) {
    clearTimeout(blurTimer)
    blurTimer = null
  }
  emit('update:modelValue', model.id)
  closePicker()
  inputEl.value?.blur()
}

function moveActive(delta: number) {
  if (!filteredModels.value.length) return
  const next = activeIndex.value + delta
  activeIndex.value = ((next % filteredModels.value.length) + filteredModels.value.length) % filteredModels.value.length
}

function onInput(event: Event) {
  query.value = (event.target as HTMLInputElement).value
  open.value = true
  activeIndex.value = filteredModels.value.length ? 0 : -1
  updatePanelPosition()
}

function onFocus() {
  if (blurTimer) {
    clearTimeout(blurTimer)
    blurTimer = null
  }
  if (selectedModel.value && !query.value) {
    query.value = ''
  }
  openPicker()
}

function onBlur() {
  blurTimer = setTimeout(() => closePicker(), 120)
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!open.value) openPicker()
    else moveActive(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) openPicker()
    else moveActive(-1)
    return
  }
  if (e.key === 'Enter') {
    if (open.value && filteredModels.value.length && activeIndex.value >= 0) {
      const model = filteredModels.value[activeIndex.value]
      if (model) {
        e.preventDefault()
        pick(model)
      }
    }
    return
  }
  if (e.key === 'Escape') {
    if (open.value) {
      e.preventDefault()
      closePicker()
    }
  }
}

function toggleOpen() {
  if (open.value) {
    closePicker()
    inputEl.value?.blur()
  }
  else {
    inputEl.value?.focus()
  }
}

watch([filteredModels, sortBy], () => {
  if (open.value) {
    activeIndex.value = filteredModels.value.length ? 0 : -1
    updatePanelPosition()
  }
})

watch(() => props.apiKey, () => {
  if (models.value.length) return
  void loadModels()
}, { immediate: true })

function onWindowReposition() {
  if (showList.value) updatePanelPosition()
}

onMounted(() => {
  window.addEventListener('resize', onWindowReposition)
  window.addEventListener('scroll', onWindowReposition, true)
})

onBeforeUnmount(() => {
  if (blurTimer) clearTimeout(blurTimer)
  window.removeEventListener('resize', onWindowReposition)
  window.removeEventListener('scroll', onWindowReposition, true)
})
</script>

<template>
  <div class="or-model-picker">
    <div class="or-model-picker__toolbar">
      <button type="button" class="btn sm" :disabled="disabled || loadStatus === 'loading'" @click="loadModels">
        {{ loadStatus === 'loading' ? 'Loading…' : models.length ? 'Refresh models' : 'Load models from OpenRouter' }}
      </button>
      <label class="or-model-picker__sort">
        <span>Sort</span>
        <select v-model="sortBy" :disabled="!models.length || disabled">
          <option value="maker">Maker</option>
          <option value="name">Name</option>
          <option value="cost">Input cost</option>
        </select>
      </label>
    </div>

    <label class="fld or-model-picker__field">
      Default model
      <div class="or-combo" :class="{ open, disabled: disabled || !models.length }">
        <input
          ref="inputEl"
          :value="open ? query : (selectedModel?.label ?? modelValue)"
          type="text"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          :aria-expanded="showList"
          :aria-controls="listId"
          :aria-activedescendant="showList && filteredModels[activeIndex] ? `${listId}-${filteredModels[activeIndex]!.id}` : undefined"
          :placeholder="inputPlaceholder"
          :disabled="disabled || !models.length"
          @input="onInput"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onKeydown"
        >
        <button
          type="button"
          class="or-combo__toggle"
          tabindex="-1"
          :disabled="disabled || !models.length"
          :aria-label="open ? 'Close model list' : 'Open model list'"
          @mousedown.prevent="toggleOpen"
        >
          ▾
        </button>
      </div>
      <span v-if="selectedModel" class="help">{{ selectedModel.id }}</span>
      <span v-else-if="modelValue" class="help">{{ modelValue }}</span>
      <span v-else class="help">Live catalog from OpenRouter with input/output cost per 1M tokens.</span>
    </label>

    <Teleport to="body">
      <div
        v-show="showList"
        :id="listId"
        class="or-combo-panel"
        role="listbox"
        :style="panelStyle"
        aria-label="OpenRouter models"
      >
        <p v-if="listEmptyMessage" class="or-combo-empty">{{ listEmptyMessage }}</p>
        <template v-else>
          <template v-for="(model, i) in filteredModels" :key="model.id">
            <div
              v-if="i === 0 || filteredModels[i - 1]!.maker !== model.maker"
              class="or-combo-group"
            >
              {{ model.maker }}
            </div>
            <button
              type="button"
              :id="`${listId}-${model.id}`"
              role="option"
              class="or-combo-option"
              :class="{ on: i === activeIndex, selected: model.id === modelValue }"
              :aria-selected="i === activeIndex"
              @mousedown.prevent="pick(model)"
              @mouseenter="activeIndex = i"
            >
              <span class="or-combo-option__main">
                <b>{{ model.name }}</b>
                <span class="or-combo-option__cost">{{ model.label.split(' — ')[1] ?? '' }}</span>
              </span>
              <span class="or-combo-option__id">{{ model.id }}</span>
            </button>
          </template>
        </template>
        <p v-if="filteredModels.length" class="or-combo-foot">
          {{ filteredModels.length }} model{{ filteredModels.length === 1 ? '' : 's' }}
        </p>
      </div>
    </Teleport>

    <p v-if="loadError" class="settings-err">{{ loadError }}</p>
  </div>
</template>

<style scoped>
.or-model-picker__toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.or-model-picker__sort {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.or-model-picker__sort select {
  margin: 0;
  min-width: 140px;
}
.or-model-picker__field {
  margin-bottom: 0;
}
.or-combo {
  position: relative;
  display: flex;
  align-items: stretch;
}
.or-combo input {
  flex: 1;
  min-width: 0;
  padding-right: 36px;
}
.or-combo.open input {
  border-color: #a5b4fc;
  outline: 2px solid #c7d2fe;
  outline-offset: 1px;
}
.or-combo__toggle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 34px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  border-radius: 0 8px 8px 0;
}
.or-combo__toggle:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.or-combo__toggle:not(:disabled):hover {
  color: #4f46e5;
  background: #f8fafc;
}
</style>

<style>
.or-combo-panel {
  z-index: 10050;
  margin: 0;
  padding: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
  max-height: 320px;
  overflow: auto;
}
.or-combo-group {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 10px 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
}
.or-combo-option {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.or-combo-option.on,
.or-combo-option:hover {
  background: #eef2ff;
}
.or-combo-option.selected {
  background: #f5f3ff;
}
.or-combo-option__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.or-combo-option__main b {
  font-size: 13px;
  font-weight: 650;
  color: #0f172a;
}
.or-combo-option__cost {
  font-size: 12px;
  color: #64748b;
}
.or-combo-option__id {
  flex-shrink: 0;
  max-width: 42%;
  font-size: 11px;
  color: #94a3b8;
  text-align: right;
  word-break: break-all;
}
.or-combo-empty,
.or-combo-foot {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: #94a3b8;
}
.or-combo-foot {
  border-top: 1px solid #f1f5f9;
  margin-top: 4px;
  text-align: right;
}
</style>
