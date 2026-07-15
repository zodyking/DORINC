// Read-only editing session observer — poll active lock for detail views (SPEC §12 / P1-31).

import { toValue, type MaybeRefOrGetter } from 'vue'
import { EDIT_SESSION_STATUS_POLL_MS } from '~/utils/invoice-editor-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

interface EditingSessionPayload {
  id: string
  entityType: string
  entityId: string
  userId: string
  userName: string
  lastHeartbeatAt: string
  acquiredAt: string
}

export function useEditingSessionStatus(
  entityType: 'invoice' | 'estimate',
  entityId: MaybeRefOrGetter<string>,
) {
  const auth = useAuthStore()

  const activeEditor = ref<{ userName: string, userId: string, sessionId: string } | null>(null)
  const loading = ref(true)
  const forceReleaseBusy = ref(false)
  const forceReleaseError = ref('')

  const readPermission = entityType === 'estimate' ? 'estimates.read.all' : 'invoices.read.all'
  const canAdminRelease = computed(() => auth.can('users.manage.all'))
  const isSelfEditing = computed(() =>
    Boolean(activeEditor.value && auth.user?.id === activeEditor.value.userId),
  )

  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function refreshStatus() {
    const eid = toValue(entityId)
    if (!eid) {
      activeEditor.value = null
      loading.value = false
      return
    }
    try {
      const { session } = await $fetch<{ session: EditingSessionPayload | null }>(
        '/api/editing-sessions',
        { query: { entityType, entityId: eid } },
      )
      activeEditor.value = session
        ? { userName: session.userName, userId: session.userId, sessionId: session.id }
        : null
    }
    catch {
      // Non-fatal for read-only observers.
    }
    finally {
      loading.value = false
    }
  }

  async function forceRelease(reason: string) {
    if (!activeEditor.value) return
    forceReleaseBusy.value = true
    forceReleaseError.value = ''
    try {
      await $fetch(`/api/editing-sessions/${activeEditor.value.sessionId}/admin-release`, {
        method: 'POST',
        body: { reason },
      })
      activeEditor.value = null
    }
    catch (e: unknown) {
      forceReleaseError.value = syncFetchErrorMessage(e, 'Could not force-release the editing session')
    }
    finally {
      forceReleaseBusy.value = false
    }
  }

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(() => { void refreshStatus() }, EDIT_SESSION_STATUS_POLL_MS)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  watch(
    () => toValue(entityId),
    () => {
      loading.value = true
      void refreshStatus()
    },
  )

  onMounted(() => {
    if (!auth.can(readPermission)) {
      loading.value = false
      return
    }
    void refreshStatus()
    startPolling()
  })

  onBeforeUnmount(() => {
    stopPolling()
  })

  return {
    activeEditor,
    loading,
    canAdminRelease,
    isSelfEditing,
    forceRelease,
    forceReleaseBusy,
    forceReleaseError,
    refreshStatus,
  }
}
