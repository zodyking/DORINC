<script setup lang="ts">
import type { DeletionEntityType } from '~/server/db/schema/deletion-requests'

const props = defineProps<{
  entityType: DeletionEntityType
  entityId: string
  entityLabel: string
  removed?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ submitted: [] }>()

const auth = useAuthStore()
const canSubmit = computed(() => auth.can('deletion_requests.submit.all'))
const canReview = computed(() => auth.can('deletion_requests.review.all'))
const canDirectVoid = computed(() =>
  auth.can('invoices.void.all') && auth.can('deletion_requests.review.all'),
)
const showSubmit = computed(() => canSubmit.value && !canDirectVoid.value)

const { data: pendingData, refresh: refreshPending } = await useFetch<{
  pending: { id: string, status: string, reason: string, createdAt: string } | null
}>('/api/deletion-requests/pending', {
  query: computed(() => ({
    entityType: props.entityType,
    entityId: props.entityId,
  })),
  watch: [() => props.entityId],
  lazy: true,
  server: false,
  default: () => ({ pending: null }),
})

const pending = computed(() => pendingData.value?.pending)
const modalOpen = ref(false)
const reason = ref('')
const busy = ref(false)
const error = ref('')

async function submit() {
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
    modalOpen.value = false
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
</script>

<template>
  <template v-if="showSubmit && !removed">
    <span v-if="pending" class="pill warn" style="margin-right:8px;">Deletion pending</span>
    <button
      v-if="!pending"
      type="button"
      class="btn"
      :disabled="disabled || busy"
      @click="modalOpen = true"
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

  <div v-if="modalOpen" class="modal-scrim open" @click.self="modalOpen = false">
    <div class="card modal-card" style="max-width:480px; width:100%;">
      <div class="chead"><h3>Request deletion</h3></div>
      <div class="cbody">
        <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
          An admin must approve before <strong>{{ entityLabel }}</strong> is removed.
          Records are archived or voided — never permanently erased.
        </p>
        <label class="fld">
          Reason for deletion
          <textarea v-model="reason" rows="4" placeholder="Why should this record be removed?" />
        </label>
        <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button type="button" class="btn primary" :disabled="busy" @click="submit">
            {{ busy ? 'Submitting…' : 'Submit request' }}
          </button>
          <button type="button" class="btn" :disabled="busy" @click="modalOpen = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>
