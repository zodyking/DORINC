<script setup lang="ts">
import {
  CATALOG_ITEM_TYPE_OPTIONS,
  defaultUomForCatalogType,
  type CatalogItemType,
} from '~/utils/catalog-ui'
import { inferCatalogCategory } from '#shared/catalog-category-inference'

export interface CatalogItemFormValue {
  itemType: CatalogItemType
  sku: string
  name: string
  description: string
  categoryId: string
  defaultPrice: string
  cost: string
  markupPercent: string
  taxable: boolean
  uom: string
  vendor: string
}

const model = defineModel<CatalogItemFormValue>({ required: true })

const props = defineProps<{
  busy?: boolean
  submitLabel: string
  error?: string
  categories: { id: string, name: string }[]
  editing?: boolean
}>()

const emit = defineEmits<{ submit: [], cancel: [], archive: [] }>()

const showMore = ref(false)
const categoryTouched = ref(false)
const suggestedCategory = ref<string | null>(null)

watch(() => model.value.itemType, (type) => {
  if (props.editing) return
  model.value.uom = defaultUomForCatalogType(type)
})

watch(
  () => [model.value.name, model.value.description, props.categories, props.editing] as const,
  ([name, description, categories, editing]) => {
    if (editing || categoryTouched.value) {
      suggestedCategory.value = null
      return
    }
    const text = [name, description].filter(Boolean).join(' ')
    const match = inferCatalogCategory(text, categories)
    suggestedCategory.value = match?.categoryName ?? null
    if (match) model.value.categoryId = match.categoryId
  },
)

function onCategoryChange() {
  categoryTouched.value = true
  suggestedCategory.value = null
}

watch(() => props.editing, (editing) => {
  if (!editing) {
    categoryTouched.value = false
    suggestedCategory.value = null
  }
})

function setType(type: CatalogItemType) {
  if (props.editing) return
  model.value.itemType = type
}

const priceLabel = computed(() => {
  switch (model.value.itemType) {
    case 'part': return 'Unit price'
    case 'labor': return 'Rate per hour'
    case 'fee': return 'Fee amount'
  }
})

const pricePlaceholder = computed(() => {
  switch (model.value.itemType) {
    case 'part': return 'e.g. 48.20'
    case 'labor': return 'e.g. 125.00'
    case 'fee': return 'e.g. 3.5 for %'
  }
})
</script>

<template>
  <form class="cat-form" @submit.prevent="emit('submit')">
    <div class="mbody">
      <p v-if="error" class="err">{{ error }}</p>

      <fieldset class="cat-type-field" :disabled="!!editing">
        <legend>Type</legend>
        <div class="cat-type-row" role="radiogroup" aria-label="Item type">
          <button
            v-for="opt in CATALOG_ITEM_TYPE_OPTIONS"
            :key="opt.value"
            type="button"
            class="cat-type-btn"
            :class="{ on: model.itemType === opt.value }"
            :aria-pressed="model.itemType === opt.value"
            @click="setType(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </fieldset>

      <label class="fld">
        <span>Name <span class="req">*</span></span>
        <input v-model="model.name" type="text" required maxlength="200" placeholder="e.g. NOx sensor, shop supplies">
      </label>

      <div class="row2">
        <label class="fld">
          <span>{{ priceLabel }}</span>
          <input v-model="model.defaultPrice" type="text" inputmode="decimal" :placeholder="pricePlaceholder">
        </label>
        <label class="fld">
          <span>Category</span>
          <select v-model="model.categoryId" @change="onCategoryChange">
            <option value="">Uncategorized</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <span v-if="suggestedCategory && !categoryTouched" class="cat-hint">
            Suggested: {{ suggestedCategory }}
          </span>
        </label>
      </div>

      <details class="cat-more" :open="showMore" @toggle="showMore = ($event.target as HTMLDetailsElement).open">
        <summary>More options</summary>
        <div class="cat-more-body">
          <label class="fld">
            <span>SKU</span>
            <input v-model="model.sku" type="text" maxlength="40" placeholder="Optional part number" class="mono">
          </label>
          <label class="fld">
            <span>Note</span>
            <input v-model="model.description" type="text" maxlength="2000" placeholder="Short note for lists">
          </label>
          <div class="row2">
            <label class="fld">
              <span>Cost</span>
              <input v-model="model.cost" type="text" inputmode="decimal" placeholder="Optional">
            </label>
            <label class="fld">
              <span>Markup %</span>
              <input v-model="model.markupPercent" type="text" inputmode="decimal" placeholder="Optional">
            </label>
          </div>
          <label class="fld">
            <span>Vendor</span>
            <input v-model="model.vendor" type="text" maxlength="120" placeholder="Optional supplier">
          </label>
          <label class="fld chk">
            <input v-model="model.taxable" type="checkbox">
            Taxable on invoices
          </label>
        </div>
      </details>
    </div>

    <div class="mfoot">
      <button v-if="editing" type="button" class="btn danger" :disabled="busy" @click="emit('archive')">Archive</button>
      <span class="spacer" />
      <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">Cancel</button>
      <button type="submit" class="btn primary" :disabled="busy">{{ submitLabel }}</button>
    </div>
  </form>
</template>

<style scoped>
.cat-form .mbody {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cat-type-field {
  margin: 0;
  padding: 0;
  border: 0;
}

.cat-type-field legend {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 8px;
}

.cat-type-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.cat-type-btn {
  appearance: none;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 11px 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.cat-type-btn:hover:not(:disabled) {
  border-color: #c7d2fe;
  background: #f8fafc;
}

.cat-type-btn.on {
  border-color: #4f46e5;
  background: #eef2ff;
  color: #4338ca;
}

.cat-type-field:disabled .cat-type-btn {
  opacity: 0.65;
  cursor: not-allowed;
}

.req {
  color: #dc2626;
}

.cat-more {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.cat-more summary {
  cursor: pointer;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  list-style: none;
}

.cat-more summary::-webkit-details-marker {
  display: none;
}

.cat-more-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 14px 14px;
  border-top: 1px solid #e2e8f0;
}

.row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 520px) {
  .row2 {
    grid-template-columns: 1fr;
  }
}

.err {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 13px;
}

.fld.chk {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.cat-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #6366f1;
  font-weight: 500;
}

.mfoot {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mfoot .spacer {
  flex: 1;
}

.btn.danger {
  border-color: #fecaca;
  color: #dc2626;
  background: #fff;
}

.btn.danger:hover {
  background: #fef2f2;
}
</style>
