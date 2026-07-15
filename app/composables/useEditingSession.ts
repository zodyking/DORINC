// Editing session composable — acquire, heartbeat, release (SPEC §12 / P1-24, P1-31).

import { EDIT_SESSION_HEARTBEAT_MS, EDIT_SESSION_STATUS_POLL_MS } from '~/utils/invoice-editor-ui'

interface EditingSessionPayload {
  id: string
  entityType: string
  entityId: string
  userId: string
  userName: string
  lastHeartbeatAt: string
  acquiredAt: string
}

export function useEditingSession(entityType: 'invoice' | 'estimate', entityId: string) {
  const auth = useAuthStore()

  const sessionId = ref<string | null>(null)
  const lockedByOther = ref<{ userName: string, userId: string } | null>(null)
  const loading = ref(true)
  const error = ref('')

  const canEdit = computed(() =>
    Boolean(sessionId.value) && !lockedByOther.value,
  )

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let lockPollTimer: ReturnType<typeof setInterval> | null = null

  async function fetchActiveSession() {
    const { session } = await $fetch<{ session: EditingSessionPayload | null }>(
      '/api/editing-sessions',
      { query: { entityType, entityId } },
    )
    return session
  }

  async function acquire() {
    loading.value = true
    error.value = ''
    lockedByOther.value = null
    try {
      const { session } = await $fetch<{ session: EditingSessionPayload }>(
        '/api/editing-sessions/acquire',
        { method: 'POST', body: { entityType, entityId } },
      )
      sessionId.value = session.id
      stopLockPolling()
    }
    catch (e: unknown) {
      const err = e as { data?: { code?: string, details?: { editorName?: string, editorUserId?: string } } }
      if (err.data?.code === 'EDIT_SESSION_ACTIVE') {
        lockedByOther.value = {
          userName: err.data.details?.editorName ?? 'Another user',
          userId: err.data.details?.editorUserId ?? '',
        }
        startLockPolling()
      }
      else {
        error.value = (e as { data?: { message?: string, data?: { message?: string } } })?.data?.data?.message
          ?? (e as { data?: { message?: string } })?.data?.message
          ?? 'Could not open the editor — refresh and try again'
      }
    }
    finally {
      loading.value = false
    }
  }

  async function heartbeat() {
    if (!sessionId.value) return
    try {
      await $fetch(`/api/editing-sessions/${sessionId.value}/heartbeat`, { method: 'POST' })
    }
    catch {
      sessionId.value = null
      await acquire()
    }
  }

  async function release() {
    if (!sessionId.value) return
    const id = sessionId.value
    sessionId.value = null
    try {
      await $fetch(`/api/editing-sessions/${id}/release`, { method: 'POST' })
    }
    catch {
      // Best-effort — stale expiry will clear the lock.
    }
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => { void heartbeat() }, EDIT_SESSION_HEARTBEAT_MS)
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function startLockPolling() {
    if (lockPollTimer) return
    lockPollTimer = setInterval(async () => {
      if (sessionId.value) return
      try {
        const session = await fetchActiveSession()
        if (!session) {
          stopLockPolling()
          await acquire()
          if (sessionId.value) startHeartbeat()
          return
        }
        if (session.userId !== auth.user?.id) {
          lockedByOther.value = { userName: session.userName, userId: session.userId }
        }
      }
      catch {
        // Ignore transient poll failures.
      }
    }, EDIT_SESSION_STATUS_POLL_MS)
  }

  function stopLockPolling() {
    if (lockPollTimer) {
      clearInterval(lockPollTimer)
      lockPollTimer = null
    }
  }

  onMounted(async () => {
    if (!auth.loaded) {
      await auth.fetchMe()
    }
    if (!auth.can('invoices.update.all')) {
      loading.value = false
      return
    }
    await acquire()
    if (sessionId.value) startHeartbeat()
  })

  onBeforeUnmount(() => {
    stopHeartbeat()
    stopLockPolling()
    void release()
  })

  if (import.meta.client) {
    window.addEventListener('beforeunload', () => {
      if (sessionId.value) {
        navigator.sendBeacon(
          `/api/editing-sessions/${sessionId.value}/release`,
          new Blob([], { type: 'application/json' }),
        )
      }
    })
  }

  return {
    sessionId,
    lockedByOther,
    loading,
    error,
    canEdit,
    acquire,
    release,
  }
}
