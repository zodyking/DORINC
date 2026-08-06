<script setup lang="ts">
import type { ServiceLogSheetEditor } from '~/composables/useServiceLogSheetEditor'

/**
 * WYSIWYG replica of the printed Letter sheet.
 *
 * The markup mirrors renderServiceLogSheetHtml() cell for cell and uses the same
 * shared document CSS, so what the editor shows is what DomPDF prints.
 */
defineProps<{
  api: ServiceLogSheetEditor
  business: { businessName: string, phone: string, email: string, addressLine: string }
}>()

const emit = defineEmits<{ catalog: [sectionId: string] }>()

const blankWorkRows = Array.from({ length: 24 }, (_unused, index) => index)
</script>

<template>
  <div class="sl-pages">
    <div class="page page-front">
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

      <table v-if="api.gridRows.value.length" class="catalog-grid">
        <thead>
          <tr>
            <th class="check-cell" />
            <th class="service-name">Service</th>
            <th class="price-cell">Price</th>
            <th class="new-price-cell">New</th>
            <th class="grid-gap" />
            <th class="check-cell" />
            <th class="service-name">Service</th>
            <th class="price-cell">Price</th>
            <th class="new-price-cell">New</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in api.gridRows.value" :key="index">
            <ServiceLogSheetGroupCells
              :api="api"
              :row="row.left"
              :group-end="row.leftEnd"
              column="left"
              @catalog="emit('catalog', $event)"
            />
            <td class="grid-gap" />
            <ServiceLogSheetGroupCells
              :api="api"
              :row="row.right"
              :group-end="row.rightEnd"
              column="right"
              @catalog="emit('catalog', $event)"
            />
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-sheet">
        No sections yet — add a left or right section to start the catalog.
      </div>
    </div>

    <div class="page page-back">
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

      <table class="sign-row">
        <tr>
          <td class="sign-left">
            <div class="sign-line">Customer Signature / Authorization</div>
          </td>
          <td class="sign-right">
            <div class="sign-line">Date</div>
          </td>
        </tr>
      </table>
    </div>
  </div>
</template>

<style scoped>
.sl-pages {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
