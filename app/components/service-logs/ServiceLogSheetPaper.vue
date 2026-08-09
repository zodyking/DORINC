<script setup lang="ts">
import { SERVICE_LOG_SHEET_PAGE_MARGIN_IN, SERVICE_LOG_SHEET_SCOPE_CLASS } from '#shared/service-log-sheet-styles'
import { sheetRightTrailingVoid } from '#shared/service-log-sheet-layout'
import {
  SERVICE_LOG_SHEET_UPLOAD_HELP,
  SERVICE_LOG_SHEET_UPLOAD_TITLE,
} from '#shared/service-log-sheet-upload'
import type { ServiceLogSheetEditor } from '~/composables/useServiceLogSheetEditor'

/**
 * WYSIWYG replica of the printed Letter sheet.
 *
 * The markup mirrors renderServiceLogSheetHtml() cell for cell and uses the same
 * shared document CSS, so what the editor shows is what DomPDF prints.
 */
const props = defineProps<{
  api: ServiceLogSheetEditor
  business: { businessName: string, phone: string, email: string, addressLine: string }
}>()

const emit = defineEmits<{ catalog: [sectionId: string] }>()

const blankWorkRows = Array.from({ length: 24 }, (_unused, index) => index)
const scopeClass = SERVICE_LOG_SHEET_SCOPE_CLASS
const gridRows = computed(() => props.api.gridRows ?? [])

const showUploadQr = computed(() => {
  const doc = props.api.doc
  if (!doc) return false
  const voidInfo = sheetRightTrailingVoid(doc)
  return Boolean(voidInfo && voidInfo.rowCount >= 3)
})

/** Inline Letter chrome — never depend only on injected styles for visibility. */
const pageStyle = {
  width: '8.5in',
  minHeight: '11in',
  height: '11in',
  padding: `${SERVICE_LOG_SHEET_PAGE_MARGIN_IN}in`,
  background: '#ffffff',
  color: '#111111',
  boxSizing: 'border-box' as const,
  boxShadow: '0 18px 50px -20px rgba(15, 23, 42, 0.45)',
  position: 'relative' as const,
}
</script>

<template>
  <div class="sl-pages" :class="scopeClass">
    <div class="page page-front" :style="pageStyle">
      <table class="header">
        <tr>
          <td class="head-company">
            <div class="company-name">{{ business.businessName }}</div>
            <div class="company-details">
              {{ business.addressLine }}<br>
              {{ [business.phone, business.email].filter(Boolean).join(' · ') }}
            </div>
          </td>
          <td class="head-doc document-title">
            <div class="doc-title">Service Log Sheet</div>
            <div class="doc-sub">Blank field log and work authorization</div>
          </td>
        </tr>
      </table>

      <table class="top-fields">
        <tr>
          <td class="f-customer">
            <span class="field-label">Customer Name</span>
            <div class="field-box" />
          </td>
          <td class="f-invoice-date">
            <span class="field-label">Invoice Date</span>
            <div class="field-box" />
          </td>
          <td class="f-due-date">
            <span class="field-label">Due Date</span>
            <div class="field-box" />
          </td>
          <td class="f-unit">
            <span class="field-label">Bus or Unit Number</span>
            <div class="field-box" />
          </td>
        </tr>
      </table>

      <div class="complaint-field">
        <span class="field-label">Customer Complaint or Vehicle Symptoms</span>
        <div class="complaint-box" />
      </div>

      <table v-if="gridRows.length" class="catalog-grid">
        <thead>
          <tr>
            <th class="check-cell" />
            <th class="service-name">Service</th>
            <th class="price-cell">Price</th>
            <th class="new-price-cell">Price</th>
            <th class="grid-gap" />
            <th class="check-cell" />
            <th class="service-name">Service</th>
            <th class="price-cell">Price</th>
            <th class="new-price-cell">Price</th>
          </tr>
        </thead>
        <tbody>
          <ServiceLogSheetCatalogRow
            v-for="(row, index) in gridRows"
            :key="index"
            :api="api"
            :row="row"
            @catalog="emit('catalog', $event)"
          />
        </tbody>
      </table>

      <div v-else class="empty-sheet">
        No sections yet — add a left or right section to start the catalog.
      </div>

      <!-- Preview stand-in for the PDF rowspan QR seated under Inspection -->
      <div v-if="showUploadQr" class="sheet-upload-qr-editor">
        <div class="sheet-upload-qr-cell">
          <div class="sheet-upload-qr-inner">
            <p class="sheet-upload-qr-title">{{ SERVICE_LOG_SHEET_UPLOAD_TITLE }}</p>
            <div class="sheet-upload-qr-placeholder" aria-hidden="true">QR</div>
            <p class="sheet-upload-qr-help">{{ SERVICE_LOG_SHEET_UPLOAD_HELP }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="page page-back" :style="pageStyle">
      <table class="header">
        <tr>
          <td class="head-company">
            <div class="company-name">{{ business.businessName }}</div>
            <div class="company-details">
              {{ business.addressLine }}<br>
              {{ [business.phone, business.email].filter(Boolean).join(' · ') }}
            </div>
          </td>
          <td class="head-doc document-title">
            <div class="doc-title">Service Log Sheet</div>
            <div class="doc-sub">Blank field log and work authorization</div>
          </td>
        </tr>
      </table>

      <div class="back-title">Additional / Custom Work</div>
      <div class="back-help">
        Use these lines for work not listed on the front — write service description, quantity, and total.
      </div>

      <table class="blank-work-table">
        <thead>
          <tr>
            <th class="w-desc">Service Description</th>
            <th class="w-qty">Quantity</th>
            <th class="w-total">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in blankWorkRows" :key="row">
            <td class="w-desc">&nbsp;</td>
            <td class="w-qty">&nbsp;</td>
            <td class="w-total">&nbsp;</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.sl-pages {
  display: flex;
  flex-direction: column;
  gap: 24px;
  color: #111111;
  background: transparent;
}
.sheet-upload-qr-editor {
  position: absolute;
  right: 0.4in;
  bottom: 0.4in;
  width: 46%;
  pointer-events: none;
}
.sheet-upload-qr-placeholder {
  width: 56pt;
  height: 56pt;
  margin: 0 auto 4pt;
  border: 0.8pt solid #111;
  display: grid;
  place-items: center;
  font-size: 9pt;
  font-weight: 800;
  letter-spacing: 0.08em;
}
</style>
