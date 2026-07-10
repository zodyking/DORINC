<script setup lang="ts">
import { calcLineAmount, type WizardLineDraft } from '~/utils/line-item-wizard-ui'
import { lineTypeLabel } from '~/utils/invoices-ui'
import { catalogTypePill } from '~/utils/catalog-ui'

withDefaults(defineProps<{
  lines: WizardLineDraft[]
  title?: string
  removable?: boolean
  editingIndex?: number | null
  sessionOpen?: boolean
}>(), {
  title: 'Your lines',
  removable: false,
  editingIndex: null,
  sessionOpen: false,
})

const emit = defineEmits<{
  remove: [index: number]
}>()

function displayAmount(line: WizardLineDraft) {
  return line.amount || calcLineAmount(line.qty, line.rate)
}
</script>

<template>
  <section v-if="lines.length" class="li-items-table" aria-label="Line items">
    <p v-if="title" class="li-items-table-title">{{ title }}</p>
    <div class="tscroll li-items-table-wrap">
      <table class="ed-lines li-items-table-grid">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-type">Type</th>
            <th class="col-desc">Description</th>
            <th class="col-qty">Qty / Hrs</th>
            <th class="col-rate">Rate</th>
            <th class="col-amt">Amount</th>
            <th v-if="removable" class="col-rm" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(line, i) in lines"
            :key="i"
            class="li-line-row"
            :class="{ editing: sessionOpen && editingIndex === i }"
          >
            <td class="col-num">{{ i + 1 }}</td>
            <td class="col-type">
              <span :class="catalogTypePill(line.lineType)">{{ lineTypeLabel(line.lineType) }}</span>
            </td>
            <td class="col-desc">{{ line.description }}</td>
            <td class="col-qty">{{ line.qty }}</td>
            <td class="col-rate">{{ line.rate }}</td>
            <td class="col-amt">{{ displayAmount(line) ? moneyDisplay(displayAmount(line)) : '—' }}</td>
            <td v-if="removable" class="col-rm">
              <button type="button" class="rm" aria-label="Remove line" @click="emit('remove', i)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
