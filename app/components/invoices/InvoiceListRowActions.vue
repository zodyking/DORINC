<script setup lang="ts">
import PageActionsMenu from '~/components/staff/PageActionsMenu.vue'
import type { InvoiceStatus } from '~/utils/invoices-ui'

const props = defineProps<{
  invoiceId: string
  invoiceLabel: string
  status: InvoiceStatus
}>()

const emit = defineEmits<{ changed: [] }>()

const auth = useAuthStore()

const ready = computed(() => auth.loaded)

const canUpdate = computed(() => ready.value && auth.can('invoices.update.all'))
const canSend = computed(() => ready.value && auth.can('invoices.send.all'))
const canDelete = computed(() => ready.value && auth.can('deletion_requests.submit.all'))

const showSend = computed(() => canSend.value && props.status === 'approved')
const showEdit = computed(() => canUpdate.value && props.status === 'draft')
const showDelete = computed(() => canDelete.value && props.status !== 'void' && props.status !== 'paid')
</script>

<template>
  <div v-if="ready" class="inv-row-actions" @click.stop>
    <PageActionsMenu>
      <SendInvoiceButton
        v-if="showSend"
        :invoice-id="invoiceId"
        label="Send"
        button-class="btn"
        @sent="emit('changed')"
      />
      <NuxtLink
        v-if="showEdit"
        :to="`/invoices/${invoiceId}/edit`"
        class="btn"
      >
        Edit
      </NuxtLink>
      <DeleteEntityButton
        v-if="showDelete"
        entity-type="invoice"
        :entity-id="invoiceId"
        :entity-label="invoiceLabel"
        menu-item
        @submitted="emit('changed')"
      />
      <NuxtLink
        v-if="!showSend && !showEdit && !showDelete"
        :to="`/invoices/${invoiceId}`"
        class="btn"
      >
        View invoice
      </NuxtLink>
    </PageActionsMenu>
  </div>
</template>

<style scoped>
.inv-row-actions {
  display: flex;
  justify-content: flex-end;
}
.inv-row-actions :deep(.page-actions__panel) {
  right: 0;
  left: auto;
}
</style>
