<script setup lang="ts">
// Add/edit catalog item fields (mockup: PAGE: CATALOG + New Item modal).
import { CATALOG_UOM_OPTIONS, type CatalogItemType } from '~/utils/catalog-ui'

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

watch(() => model.value.itemType, (type) => {
  if (props.editing) return
  if (type === 'labor' && model.value.uom === 'each') model.value.uom = 'hr'
  if (type === 'fee' && (model.value.uom === 'each' || model.value.uom === 'hr')) model.value.uom = 'pct'
  if ((type === 'part' || type === 'service') && (model.value.uom === 'hr' || model.value.uom === 'pct')) {
    model.value.uom = 'each'
  }
})
</script>

<template>
  <form @submit.prevent="emit('submit')">
    <div class="mbody">
      <p v-if="error" class="err">{{ error }}</p>

      <label class="fld">Type <span style="color:#dc2626">*</span>
        <select v-model="model.itemType" :disabled="!!editing">
          <option value="part">Part</option>
          <option value="service">Service</option>
          <option value="fee">Fee</option>
          <option value="labor">Labor rate</option>
        </select>
      </label>

      <label class="fld">Name <span style="color:#dc2626">*</span>
        <input v-model="model.name" type="text" required maxlength="200" placeholder="e.g. NOx sensor, outlet">
      </label>

      <label class="fld">SKU
        <input v-model="model.sku" type="text" maxlength="40" placeholder="e.g. PART-0287" class="mono" style="font-size:13px">
      </label>

      <label class="fld">Description
        <textarea v-model="model.description" rows="2" maxlength="2000" placeholder="Short note shown under the item name in lists" />
      </label>

      <label class="fld">Category
        <select v-model="model.categoryId">
          <option value="">Uncategorized</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>

      <div class="row2">
        <label class="fld">Default price / rate
          <input v-model="model.defaultPrice" type="text" inputmode="decimal" placeholder="0.00">
          <span class="help">Use percent value for fee items (e.g. 3.5)</span>
        </label>
        <label class="fld">Unit of measure
          <select v-model="model.uom">
            <option v-for="opt in CATALOG_UOM_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
      </div>

      <div class="row2">
        <label class="fld">Cost
          <input v-model="model.cost" type="text" inputmode="decimal" placeholder="Optional">
        </label>
        <label class="fld">Markup %
          <input v-model="model.markupPercent" type="text" inputmode="decimal" placeholder="Optional">
        </label>
      </div>

      <label class="fld">Vendor
        <input v-model="model.vendor" type="text" maxlength="120" placeholder="Optional supplier">
      </label>

      <label class="fld chk">
        <input v-model="model.taxable" type="checkbox">
        Taxable on invoices
      </label>
    </div>

    <div class="mfoot">
      <button v-if="editing" type="button" class="btn danger" :disabled="busy" @click="emit('archive')">Archive item</button>
      <span class="spacer" />
      <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">Cancel</button>
      <button type="submit" class="btn primary" :disabled="busy">{{ submitLabel }}</button>
    </div>
  </form>
</template>

<style scoped>
.row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 520px) {
  .row2 { grid-template-columns: 1fr; }
}
.err {
  margin: 0 0 12px;
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
.mfoot {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mfoot .spacer { flex: 1; }
.btn.danger {
  border-color: #fecaca;
  color: #dc2626;
  background: #fff;
}
.btn.danger:hover { background: #fef2f2; }
</style>
