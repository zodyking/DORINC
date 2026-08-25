<script setup lang="ts">
import CatalogLineAutocomplete from '~/components/invoices/CatalogLineAutocomplete.vue'
import LineCurrencyInput from '~/components/invoices/LineCurrencyInput.vue'
import LineQuantityInput from '~/components/invoices/LineQuantityInput.vue'
import InvoiceDiscountField from '~/components/invoices/InvoiceDiscountField.vue'
import InvoicePriceStack from '~/components/invoices/InvoicePriceStack.vue'
import InvoiceSummaryPanel from '~/components/invoices/InvoiceSummaryPanel.vue'
import {
  LINE_TYPE_OPTIONS,
  previewLineAmount,
  previewLineGrossAmount,
} from '~/utils/invoice-creator-ui'
import { focusVisibleLineInput } from '~/utils/line-field-focus'
import type { InvoiceLineType } from '~/utils/invoices-ui'
import type { CatalogQuickItem, InvoiceSummaryRow } from '~/utils/invoice-editor-ui'

export interface EditorLineRow {
  id?: string
  localId?: string
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  lineAmount?: string
  discountAmount?: string | null
  discountPercent?: string | null
  taxable?: boolean
  catalogItemId?: string | null
}

const props = withDefaults(defineProps<{
  lines: EditorLineRow[]
  editable: boolean
  busy?: boolean
  summaryRows: InvoiceSummaryRow[]
  showMobileCards?: boolean
  showSummary?: boolean
  discountEditable?: boolean
  discountBase?: string
}>(), {
  busy: false,
  showMobileCards: false,
  showSummary: true,
  discountEditable: false,
  discountBase: '0',
})

const discountAmount = defineModel<string>('discountAmount', { default: '0' })
const discountPercent = defineModel<string | null>('discountPercent', { default: null })

const emit = defineEmits<{
  focus: [lineId: string]
  patch: [line: EditorLineRow]
  remove: [lineId: string]
  'focus-qty': [lineId: string]
  'focus-rate': [lineId: string]
  'rate-tab-next': [line: EditorLineRow]
  'catalog-select': [line: EditorLineRow, item: CatalogQuickItem]
  'discount-blur': []
}>()

const editingDiscountLineId = ref<string | null>(null)
const mobileLines = ref(false)

function syncMobileLines() {
  mobileLines.value = window.matchMedia('(max-width: 720px)').matches
}

function lineRowId(line: EditorLineRow): string {
  return line.id || line.localId || ''
}

function ensureLineDiscount(line: EditorLineRow) {
  if (line.discountAmount == null || line.discountAmount === '') line.discountAmount = '0'
}

function lineGross(line: EditorLineRow): string {
  return previewLineGrossAmount(line.quantity, line.unitPrice) || line.lineAmount || '0'
}

function lineNet(line: EditorLineRow): string {
  return previewLineAmount(line.quantity, line.unitPrice, line) || line.lineAmount || '0'
}

function isEditingLineDiscount(line: EditorLineRow) {
  return props.editable && editingDiscountLineId.value === lineRowId(line)
}

function showTableDiscount(line: EditorLineRow) {
  return isEditingLineDiscount(line) && (!props.showMobileCards || !mobileLines.value)
}

function showCardDiscount(line: EditorLineRow) {
  return isEditingLineDiscount(line) && props.showMobileCards && mobileLines.value
}

function closeLineDiscount(line?: EditorLineRow) {
  const currentId = editingDiscountLineId.value
  editingDiscountLineId.value = null
  const current = line || props.lines.find(item => lineRowId(item) === currentId)
  if (current) emit('patch', current)
}

function onAmountDblClick(line: EditorLineRow) {
  if (!props.editable) return
  const id = lineRowId(line)
  if (editingDiscountLineId.value === id) {
    closeLineDiscount(line)
    return
  }
  if (editingDiscountLineId.value) closeLineDiscount()
  ensureLineDiscount(line)
  editingDiscountLineId.value = id
  void nextTick(() => focusVisibleLineInput(id, 'discount'))
}

function onLineDiscountBlur(line: EditorLineRow) {
  if (editingDiscountLineId.value !== lineRowId(line)) return
  closeLineDiscount(line)
}

function onLineDiscountTabNext(line: EditorLineRow) {
  onLineDiscountBlur(line)
  emit('rate-tab-next', line)
}

function onRateTabNext(line: EditorLineRow) {
  emit('patch', line)
  emit('rate-tab-next', line)
}

function onLineTyped(line: EditorLineRow) {
  line.catalogItemId = null
}

watch(() => props.editable, (editable) => {
  if (!editable) editingDiscountLineId.value = null
})

onMounted(() => {
  if (!props.showMobileCards) return
  syncMobileLines()
  window.addEventListener('resize', syncMobileLines)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMobileLines)
})
</script>

<template>
  <div class="inv-lines-block">
    <div class="tscroll" :class="{ 'inv-line-table--desktop': showMobileCards }">
      <table class="ed-lines">
        <thead>
          <tr>
            <th style="width:110px">Type</th>
            <th>Description</th>
            <th style="width:110px">Qty / Hrs</th>
            <th style="width:150px">Rate</th>
            <th style="width:150px; text-align:right">Amount</th>
            <th style="width:36px" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in lines" :key="lineRowId(line)">
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
                :line-id="lineRowId(line)"
                :disabled="!editable"
                @focus="emit('focus', lineRowId(line))"
                @blur="emit('patch', line)"
                @tab-next="emit('focus-qty', lineRowId(line))"
                @typed="onLineTyped(line)"
                @select="emit('catalog-select', line, $event)"
              />
            </td>
            <td>
              <LineQuantityInput
                v-model="line.quantity"
                :line-id="lineRowId(line)"
                :disabled="!editable"
                @blur="emit('patch', line)"
                @tab-next="emit('focus-rate', lineRowId(line))"
              />
            </td>
            <td>
              <LineCurrencyInput
                v-model="line.unitPrice"
                :line-id="lineRowId(line)"
                :disabled="!editable"
                @blur="emit('patch', line)"
                @tab-next="onRateTabNext(line)"
              />
            </td>
            <td
              class="amt amt-stack"
              :class="{
                'amt-discount-hit': editable,
                'amt-editing': showTableDiscount(line),
              }"
              :title="editable ? 'Double-click to add a discount' : undefined"
              @dblclick.prevent="onAmountDblClick(line)"
            >
              <InvoiceDiscountField
                v-if="showTableDiscount(line)"
                v-model:amount="line.discountAmount"
                v-model:percent="line.discountPercent"
                dense
                :line-id="lineRowId(line)"
                :base-amount="lineGross(line)"
                :disabled="!editable"
                aria-label="Line discount"
                @blur="onLineDiscountBlur(line)"
                @tab-next="onLineDiscountTabNext(line)"
                @dblclick.stop.prevent="closeLineDiscount(line)"
              />
              <InvoicePriceStack
                v-else
                :original="lineGross(line)"
                :current="lineNet(line)"
              />
            </td>
            <td>
              <button
                type="button"
                class="rm"
                aria-label="Remove line"
                :disabled="!editable || lines.length <= 1 || busy"
                @click="emit('remove', lineRowId(line))"
              >
                ✕
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showMobileCards" class="inv-line-cards inv-line-table--mobile">
      <article v-for="line in lines" :key="`card-${lineRowId(line)}`" class="inv-line-card">
        <div class="inv-line-card-head">
          <label class="fld inv-line-card-type">
            <span>Type</span>
            <select v-model="line.lineType" :disabled="!editable" @change="emit('patch', line)">
              <option v-for="opt in LINE_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
          <button
            type="button"
            class="rm"
            aria-label="Remove line"
            :disabled="!editable || lines.length <= 1 || busy"
            @click="emit('remove', lineRowId(line))"
          >
            ✕
          </button>
        </div>
        <label class="fld">
          <span>Description</span>
          <CatalogLineAutocomplete
            v-model="line.description"
            v-model:line-type="line.lineType"
            :line-id="lineRowId(line)"
            :disabled="!editable"
            @focus="emit('focus', lineRowId(line))"
            @blur="emit('patch', line)"
            @tab-next="emit('focus-qty', lineRowId(line))"
            @typed="onLineTyped(line)"
            @select="emit('catalog-select', line, $event)"
          />
        </label>
        <div class="inv-line-card-nums">
          <label class="fld">
            <span>Qty / Hrs</span>
            <LineQuantityInput
              v-model="line.quantity"
              :line-id="lineRowId(line)"
              :disabled="!editable"
              @blur="emit('patch', line)"
              @tab-next="emit('focus-rate', lineRowId(line))"
            />
          </label>
          <label class="fld">
            <span>Rate</span>
            <LineCurrencyInput
              v-model="line.unitPrice"
              :line-id="lineRowId(line)"
              :disabled="!editable"
              @blur="emit('patch', line)"
              @tab-next="onRateTabNext(line)"
            />
          </label>
          <div
            class="inv-line-card-amt"
            :class="{
              'amt-discount-hit': editable,
              'amt-editing': showCardDiscount(line),
            }"
            :title="editable ? 'Double-click to add a discount' : undefined"
            @dblclick.prevent="onAmountDblClick(line)"
          >
            <span class="k">Amount</span>
            <InvoiceDiscountField
              v-if="showCardDiscount(line)"
              v-model:amount="line.discountAmount"
              v-model:percent="line.discountPercent"
              dense
              :line-id="lineRowId(line)"
              :base-amount="lineGross(line)"
              :disabled="!editable"
              aria-label="Line discount"
              @blur="onLineDiscountBlur(line)"
              @tab-next="onLineDiscountTabNext(line)"
              @dblclick.stop.prevent="closeLineDiscount(line)"
            />
            <InvoicePriceStack
              v-else
              :original="lineGross(line)"
              :current="lineNet(line)"
            />
          </div>
        </div>
      </article>
    </div>

    <InvoiceSummaryPanel
      v-if="showSummary"
      v-model:discount-amount="discountAmount"
      v-model:discount-percent="discountPercent"
      :rows="summaryRows"
      :discount-editable="discountEditable"
      :discount-disabled="!editable"
      :discount-base="discountBase"
      @discount-blur="emit('discount-blur')"
    />
  </div>
</template>

<style scoped>
.inv-line-cards {
  display: none;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.inv-line-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.inv-line-card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}
.inv-line-card-type {
  flex: 1;
  margin: 0;
}
.inv-line-card-nums {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}
.inv-line-card-nums .fld {
  margin: 0;
}
.inv-line-card-amt {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.inv-line-card-amt .k {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.inv-line-card-amt.amt-editing .disc-field {
  width: 168px;
  max-width: 100%;
}
.amt-discount-hit {
  cursor: pointer;
}
@media (max-width: 720px) {
  .inv-line-table--desktop {
    display: none;
  }
  .inv-line-cards {
    display: flex;
  }
}
</style>
