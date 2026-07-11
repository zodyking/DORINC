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
const search = ref('')
const sortBy = ref<'maker' | 'name' | 'cost'>('maker')

async function loadModels() {
  loadStatus.value = 'loading'
  loadError.value = ''
  try {
    const query = props.apiKey?.trim() ? { apiKey: props.apiKey.trim() } : undefined
    const res = await $fetch<{ models: ModelOption[] }>('/api/admin/ai/models', { query })
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

const filteredModels = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = models.value
  if (q) {
    rows = rows.filter(m =>
      m.id.toLowerCase().includes(q)
      || m.name.toLowerCase().includes(q)
      || m.maker.toLowerCase().includes(q)
      || m.label.toLowerCase().includes(q),
    )
  }

  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (sortBy.value === 'maker') {
      const maker = a.maker.localeCompare(b.maker)
      return maker !== 0 ? maker : a.name.localeCompare(b.name)
    }
    if (sortBy.value === 'cost') {
      const aCost = a.promptPerMillion ?? Number.MAX_SAFE_INTEGER
      const bCost = b.promptPerMillion ?? Number.MAX_SAFE_INTEGER
      return aCost - bCost || a.name.localeCompare(b.name)
    }
    return a.name.localeCompare(b.name)
  })
  return sorted
})

const selectedModel = computed(() => models.value.find(m => m.id === props.modelValue) ?? null)

watch(() => props.apiKey, () => {
  if (models.value.length) return
  void loadModels()
}, { immediate: true })
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

    <label class="fld">
      Search models
      <input v-model="search" type="search" placeholder="Search by maker, name, or id…" :disabled="!models.length || disabled">
    </label>

    <label class="fld">
      Default model
      <select
        :value="modelValue"
        :disabled="disabled || !filteredModels.length"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-if="!filteredModels.length" value="" disabled>
          {{ loadStatus === 'loading' ? 'Loading models…' : 'Load models to choose' }}
        </option>
        <optgroup v-for="maker in [...new Set(filteredModels.map(m => m.maker))]" :key="maker" :label="maker">
          <option v-for="m in filteredModels.filter(row => row.maker === maker)" :key="m.id" :value="m.id">
            {{ m.label }}
          </option>
        </optgroup>
      </select>
      <span v-if="selectedModel" class="help">
        {{ selectedModel.id }}
      </span>
      <span v-else class="help">Live catalog from OpenRouter with input/output cost per 1M tokens.</span>
    </label>

    <p v-if="loadError" class="settings-err">{{ loadError }}</p>
    <p v-else-if="loadStatus === 'success'" class="help">
      {{ filteredModels.length }} model{{ filteredModels.length === 1 ? '' : 's' }} shown
    </p>
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
</style>
