<script setup lang="ts">
import type { DeletionEntityType } from '~/server/db/schema/deletion-requests'
import {
  DELETION_REASON_MAX_CHARS,
  DELETION_REASON_MIN_CHARS,
} from '#shared/validators/deletion-requests'
import { deletionPreservationNote } from '~/utils/deletion-requests-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

const props = defineProps<{
  entityType: DeletionEntityType
  entityId: string
  entityLabel: string
  removed?: boolean
  disabled?: boolean
  menuItem?: boolean
  hideTrigger?: boolean
  title?: string
}>()

const emit = defineEmits<{ submitted: [] }>()

const auth = useAuthStore()

const canSubmit = computed(() => auth.loaded && auth.can('deletion_requests.submit.all'))
const canReview = computed(() => auth.loaded && auth.can('deletion_requests.review.all'))
const canShow = computed(() => canSubmit.value)

const preservationNote = computed(() => deletionPreservationNote(props.entityType))

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

watch(canSubmit, (ok) => {
  if (ok && import.meta.client) void refreshPending()
}, { immediate: true })

const pending = computed(() => pendingData.value?.pending)
const requestModalOpen = ref(false)
const reason = ref('')
const busy = ref(false)
const error = ref('')

const reasonLen = computed(() => reason.value.trim().length)
const reasonReady = computed(() => reasonLen.value >= DELETION_REASON_MIN_CHARS)

function looksLikeSpam(raw: string): boolean {
  const text = raw.trim().toLowerCase()
  const compact = text.replace(/\s+/g, '')
  if (/^(.)\1{9,}$/.test(compact)) return true
  if (/^(asdf+|qwer+|zxcv+|xxx+|1234+)/.test(compact)) return true
  return false
}

async function submitRequest() {
  const trimmed = reason.value.trim()
  if (trimmed.length < DELETION_REASON_MIN_CHARS) {
    error.value = `Please explain why this should be removed (min ${DELETION_REASON_MIN_CHARS} characters).`
    return
  }
  if (looksLikeSpam(trimmed)) {
    error.value = 'Enter a clearer reason for your request'
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
        reason: trimmed,
      },
    })
    requestModalOpen.value = false
    reason.value = ''
    await refreshPending()
    emit('submitted')
  }
  catch (e: unknown) {
    const msg = syncFetchErrorMessage(e, 'Could not submit deletion request')
    error.value = /more descriptive reason|clearer reason/i.test(msg)
      ? 'Enter a clearer reason for your request'
      : msg
  }
  finally {
    busy.value = false
  }
}

function openRequestModal() {
  error.value = ''
  reason.value = ''
  requestModalOpen.value = true
}

defineExpose({ openRequestModal })
</script>

<template>
  <template v-if="!removed && canShow && !hideTrigger">
    <span v-if="pending && !menuItem" class="pill warn" style="margin-right:8px;">Deletion pending</span>

    <button
      v-if="pending && menuItem"
      type="button"
      class="btn"
      disabled
    >
      Deletion pending
    </button>

    <button
      v-if="!pending"
      type="button"
      :class="menuItem ? 'btn' : 'btn danger'"
      :disabled="disabled || busy"
      :title="title"
      @click.stop="openRequestModal"
    >
      Request deletion
    </button>
    <NuxtLink
      v-if="canReview && pending && !menuItem"
      to="/deletion-requests"
      class="btn sm"
    >
      Review queue
    </NuxtLink>
  </template>

  <Teleport to="body">
    <div v-if="requestModalOpen" class="modal-scrim open" @click.self="requestModalOpen = false">
      <div class="card modal-card" style="max-width:480px; width:100%;" @click.stop>
        <div class="chead"><h3>Request deletion</h3></div>
        <form class="cbody" @submit.prevent="submitRequest">
          <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
            An admin must approve before <strong>{{ entityLabel }}</strong> is permanently deleted.
            {{ preservationNote }}
          </p>
          <label class="fld">
            Reason for deletion
            <textarea
              v-model="reason"
              rows="4"
              :placeholder="`Why should this record be removed? (min ${DELETION_REASON_MIN_CHARS} characters)`"
              required
              :minlength="DELETION_REASON_MIN_CHARS"
              :maxlength="DELETION_REASON_MAX_CHARS"
            />
          </label>
          <p
            class="reason-counter"
            :class="{ ready: reasonReady }"
            aria-live="polite"
          >
            {{ reasonLen }}/{{ DELETION_REASON_MIN_CHARS }} min
          </p>
          <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button type="submit" class="btn danger" :disabled="busy || !reasonReady">
              {{ busy ? 'Submitting…' : 'Submit request' }}
            </button>
            <button type="button" class="btn" :disabled="busy" @click="requestModalOpen = false">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.reason-counter {
  margin: 6px 0 0;
  font-size: 12px;
  color: #94a3b8;
  text-align: right;
}
.reason-counter.ready {
  color: #64748b;
}
</style>
