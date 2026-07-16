<script setup lang="ts">
import PageActionsMenu from '~/components/staff/PageActionsMenu.vue'
import { portalInvoicePdfUrl } from '~/utils/portal-invoices-ui'

const props = defineProps<{
  invoiceId: string
}>()

function downloadPdf() {
  window.location.href = portalInvoicePdfUrl(props.invoiceId)
}
</script>

<template>
  <div class="inv-row-actions" @click.stop>
    <PageActionsMenu>
      <button type="button" class="btn" @click="downloadPdf">
        Download PDF
      </button>
    </PageActionsMenu>
  </div>
</template>

<style scoped>
.inv-row-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
