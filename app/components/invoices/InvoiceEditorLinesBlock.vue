<script setup lang="ts">
import CatalogLineAutocomplete from '~/components/invoices/CatalogLineAutocomplete.vue'
import LineCurrencyInput from '~/components/invoices/LineCurrencyInput.vue'
import LineQuantityInput from '~/components/invoices/LineQuantityInput.vue'
import {
  LINE_TYPE_OPTIONS,
  previewLineAmount,
} from '~/utils/invoice-creator-ui'
import { moneyDisplay, type InvoiceLineType } from '~/utils/invoices-ui'
import type { CatalogQuickItem } from '~/utils/invoice-editor-ui'

export interface EditorLineRow {
  id: string
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  lineAmount: string
}

defineProps<{
  lines: EditorLineRow[]
  editable: boolean
  busy?: boolean
  summaryRows: Array<{
    label: string
    value: string
    note?: string
    grand?: boolean
    strikethrough?: boolean
  }>
}>()

const emit = defineEmits<{
  focus: [lineId: string]
  patch: [line: EditorLineRow]
  remove: [lineId: string]
  'focus-qty': [lineId: string]
  'focus-rate': [lineId: string]
  'rate-tab-next': [line: EditorLineRow]
  'catalog-select': [line: EditorLineRow, item: CatalogQuickItem]
}>()
</script>

<template>
  <div class="inv-lines-block">
    <div class="tscroll">
      <table class="ed-lines">
        <thead>
          <tr>
            <th style="width:110px">Type</th>
            <th>Description</th>
            <th style="width:110px">Qty / Hrs</th>
            <th style="width:150px">Rate</th>
            <th style="width:130px; text-align:right">Amount</th>
            <th style="width:36px" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in lines" :key="line.id">
            <td>
              <select
                v-model="line.lineType"
                :disabled="!editable"
                @change="emit('patch', line)"
              >
                <option v-for="opt in LINE_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </td>
            <td>
              <CatalogLineAutocomplete
                v-model="line.description"
                v-model:line-type="line.lineType"
                :line-id="line.id"
                :disabled="!editable"
                @focus="emit('focus', line.id)"
                @blur="emit('patch', line)"
                @tab-next="emit('focus-qty', line.id)"
                @select="emit('catalog-select', line, $event)"
              />
            </td>
            <td>
              <LineQuantityInput
                v-model="line.quantity"
                :line-id="line.id"
                :disabled="!editable"
                @blur="emit('patch', line)"
                @tab-next="emit('focus-rate', line.id)"
              />
            </td>
            <td>
              <LineCurrencyInput
                v-model="line.unitPrice"
                :line-id="line.id"
                :disabled="!editable"
                @blur="emit('patch', line)"
                @tab-next="emit('rate-tab-next', line)"
              />
            </td>
            <td class="amt">{{ moneyDisplay(previewLineAmount(line.quantity, line.unitPrice) || line.lineAmount) }}</td>
            <td>
              <button
                type="button"
                class="rm"
                aria-label="Remove line"
                :disabled="!editable || lines.length <= 1 || busy"
                @click="emit('remove', line.id)"
              >
                ✕
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="ed-sums">
      <div
        v-for="(row, i) in summaryRows"
        :key="i"
        class="row"
        :class="{ grand: row.grand }"
      >
        <span>{{ row.label }}<span v-if="row.note" class="sum-note">({{ row.note }})</span></span>
        <span :class="{ 'sum-strike': row.strikethrough }">{{ row.value }}</span>
      </div>
    </div>
  </div>
</template>
