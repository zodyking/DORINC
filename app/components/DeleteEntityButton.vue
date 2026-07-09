<script setup lang="ts">
import type { DeletionEntityType } from '~/server/db/schema/deletion-requests'

const props = defineProps<{
  entityType: DeletionEntityType
  entityId: string
  entityLabel: string
  removed?: boolean
  disabled?: boolean
  /** Route after a direct delete succeeds */
  redirectTo?: string
}>()

const emit = defineEmits<{ submitted: [], deleted: [] }>()

const auth = useAuthStore()
const router = useRouter()

const canDirectDelete = computed(() => auth.loaded && auth.can('deletion_requests.review.all'))
const canRequest = computed(() =>
  auth.loaded && auth.can('deletion_requests.submit.all') && !canDirectDelete.value,
)
const canReview = computed(() => auth.loaded && auth.can('deletion_requests.review.all'))
const canShow = computed(() => canDirectDelete.value || canRequest.value)

const defaultRedirect = computed(() => {
  switch (props.entityType) {
    case 'customer': return '/customers'
    case 'vehicle': return '/vehicles'
    case 'service_log': return '/service-logs'
    case 'invoice': return '/invoices'
    default: return '/dashboard'
  }
})

const preservationNote = computed(() => {
  switch (props.entityType) {
    case 'customer':
      return 'The customer account is permanently removed. Related invoices, service logs, and vehicles keep their full customer information.'
    case 'vehicle':
      return 'The unit is permanently removed. Related invoices and service logs keep their full unit information.'
    case 'service_log':
      return 'The service log is permanently removed. Linked invoices keep their line items and customer/vehicle details.'
    case 'invoice':
      return 'The invoice is permanently removed. This cannot be undone.'
    default:
      return 'Related records keep their full information after this record is removed.'
  }
})

const { data: pendingData, refresh: refreshPending } = useFetch<{
  pending: { id: string, status: string, reason: string, createdAt: string } | null
}>('/api/deletion-requests/pending', {
  query: computed(() => ({
    entityType: props.entityType,
    entityId: props.entityId,
  })),
  watch: [() => props.entityId],
  immediate: false,
  lazy: true,
  server: false,
  default: () => ({ pending: null }),
})

watch(canRequest, (ok) => {
  if (ok && import.meta.client) void refreshPending()
}, { immediate: true })

const pending = computed(() => pendingData.value?.pending)
const deleteModalOpen = ref(false)
const requestModalOpen = ref(false)
const reason = ref('')
const busy = ref(false)
const error = ref('')

async function confirmDirectDelete() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/records/delete', {
      method: 'POST',
      body: {
        entityType: props.entityType,
        entityId: props.entityId,
        reason: reason.value.trim() || undefined,
      },
    })
    deleteModalOpen.value = false
    reason.value = ''
    emit('deleted')
    await router.push(props.redirectTo ?? defaultRedirect.value)
  }
  catch (e: unknown) {
    const err = e as { data?: { message?: string, data?: { message?: string } } }
    error.value = err.data?.data?.message ?? err.data?.message ?? 'Could not delete this record'
  }
  finally {
    busy.value = false
  }
}

async function submitRequest() {
  if (reason.value.trim().length < 10) {
    error.value = 'Please explain why this should be removed (min 10 characters).'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/deletion-requests', {
      method: 'POST',
      body: {
        entityType: props.entityType,
        entityId: props.entityId,
        reason: reason.value.trim(),
      },
    })
    requestModalOpen.value = false
    reason.value = ''
    await refreshPending()
    emit('submitted')
  }
  catch (e: unknown) {
    const err = e as { data?: { message?: string, data?: { message?: string } } }
    error.value = err.data?.data?.message ?? err.data?.message ?? 'Could not submit deletion request'
  }
  finally {
    busy.value = false
  }
}

function openDeleteModal() {
  error.value = ''
  reason.value = ''
  deleteModalOpen.value = true
}

function openRequestModal() {
  error.value = ''
  reason.value = ''
  requestModalOpen.value = true
}
</script>

<template>
  <template v-if="!removed && canShow">
    <span v-if="canRequest && pending" class="pill warn" style="margin-right:8px;">Deletion pending</span>

    <button
      v-if="canDirectDelete"
      type="button"
      class="btn danger"
      :disabled="disabled || busy"
      @click="openDeleteModal"
    >
      Delete
    </button>

    <template v-else-if="canRequest">
      <button
        v-if="!pending"
        type="button"
        class="btn danger"
        :disabled="disabled || busy"
        @click="openRequestModal"
      >
        Request deletion
      </button>
      <NuxtLink
        v-if="canReview && pending"
        to="/deletion-requests"
        class="btn sm"
      >
        Review queue
      </NuxtLink>
    </template>
  </template>

  <div v-if="deleteModalOpen" class="modal-scrim open" @click.self="deleteModalOpen = false">
    <div class="card modal-card" style="max-width:480px; width:100%;">
      <div class="chead">
        <h3>Delete record</h3>
        <span class="pill over">Permanent</span>
      </div>
      <div class="cbody">
        <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
          Permanently delete <strong>{{ entityLabel }}</strong>? {{ preservationNote }}
        </p>
        <label class="fld">
          Reason (optional)
          <textarea v-model="reason" rows="3" placeholder="Why is this being removed?" />
        </label>
        <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button type="button" class="btn danger" :disabled="busy" @click="confirmDirectDelete">
            {{ busy ? 'Deleting…' : 'Delete permanently' }}
          </button>
          <button type="button" class="btn" :disabled="busy" @click="deleteModalOpen = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <div v-if="requestModalOpen" class="modal-scrim open" @click.self="requestModalOpen = false">
    <div class="card modal-card" style="max-width:480px; width:100%;">
      <div class="chead"><h3>Request deletion</h3></div>
      <div class="cbody">
        <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
          An admin must approve before <strong>{{ entityLabel }}</strong> is permanently deleted.
          {{ preservationNote }}
        </p>
        <label class="fld">
          Reason for deletion
          <textarea v-model="reason" rows="4" placeholder="Why should this record be removed?" />
        </label>
        <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button type="button" class="btn danger" :disabled="busy" @click="submitRequest">
            {{ busy ? 'Submitting…' : 'Submit request' }}
          </button>
          <button type="button" class="btn" :disabled="busy" @click="requestModalOpen = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>
