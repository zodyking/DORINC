// Live direct messages — polling, conversations, and unread counts.

import { DM_POLL_MS } from '~/utils/messages-ui'

export interface ConversationSummary {
  id: string
  type: 'dm'
  participant: { id: string, name: string, email: string }
  lastMessage: {
    id: string
    body: string
    senderUserId: string
    createdAt: string
    preview: string
  } | null
  unreadCount: number
  updatedAt: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  body: string
  senderUserId: string
  senderName: string
  createdAt: string
  entityRefs: Array<{ entityType: string, entityId: string, entityLabel: string }>
}

export function useDirectMessages() {
  const auth = useAuthStore()
  const route = useRoute()

  const conversations = useState<ConversationSummary[]>('dm-conversations', () => [])
  const activeConversationId = useState<string | null>('dm-active-conversation', () => null)
  const messages = useState<ChatMessage[]>('dm-messages', () => [])
  const unreadTotal = useState<number>('dm-unread-total', () => 0)
  const loadingConversations = useState('dm-loading-conversations', () => false)
  const loadingMessages = useState('dm-loading-messages', () => false)
  const sending = useState('dm-sending', () => false)
  const conversationSearch = useState('dm-conversation-search', () => '')

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastMessageId: string | null = null
  let pollingStarted = false

  const canUseMessages = computed(() => auth.can('messages.read.own'))
  const activeConversation = computed(() =>
    conversations.value.find(c => c.id === activeConversationId.value) ?? null,
  )

  async function fetchUnreadCount() {
    if (!canUseMessages.value) return
    try {
      const res = await $fetch<{ count: number }>('/api/messages/unread-count')
      unreadTotal.value = res.count
    }
    catch {
      // ignore transient errors during polling
    }
  }

  async function fetchConversations() {
    if (!canUseMessages.value) return
    loadingConversations.value = true
    try {
      const res = await $fetch<{ items: ConversationSummary[] }>('/api/conversations', {
        query: {
          q: conversationSearch.value || undefined,
          page: 1,
          pageSize: 50,
        },
      })
      conversations.value = res.items
    }
    finally {
      loadingConversations.value = false
    }
  }

  async function fetchMessages(conversationId: string, afterId?: string) {
    if (!canUseMessages.value) return
    if (!afterId) loadingMessages.value = true
    try {
      const res = await $fetch<{ items: ChatMessage[] }>(`/api/conversations/${conversationId}/messages`, {
        query: {
          page: 1,
          pageSize: 100,
          afterId,
        },
      })
      if (afterId) {
        if (res.items.length) {
          messages.value = [...messages.value, ...res.items]
        }
      }
      else {
        messages.value = res.items
      }
      const last = messages.value[messages.value.length - 1]
      lastMessageId = last?.id ?? null
    }
    finally {
      loadingMessages.value = false
    }
  }

  async function openConversation(conversationId: string) {
    activeConversationId.value = conversationId
    messages.value = []
    lastMessageId = null
    await fetchMessages(conversationId)
    await markRead(conversationId)
  }

  async function markRead(conversationId: string) {
    try {
      await $fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' })
      const conv = conversations.value.find(c => c.id === conversationId)
      if (conv) conv.unreadCount = 0
      await fetchUnreadCount()
    }
    catch {
      // non-blocking
    }
  }

async function startConversation(participantUserId: string) {
  const conv = await $fetch<{ id: string }>('/api/conversations', {
    method: 'POST',
    body: { participantUserId },
  })
  await fetchConversations()
  await openConversation(conv.id)
  return conv
}

  async function sendMessage(body: string) {
    if (!activeConversationId.value || !body.trim() || sending.value) return
    sending.value = true
    try {
      const msg = await $fetch<ChatMessage>(`/api/conversations/${activeConversationId.value}/messages`, {
        method: 'POST',
        body: { body: body.trim() },
      })
      messages.value.push(msg)
      lastMessageId = msg.id
      await fetchConversations()
      await fetchUnreadCount()
    }
    finally {
      sending.value = false
    }
  }

  async function pollActive() {
    if (!canUseMessages.value) return
    await fetchUnreadCount()
    if (route.path.startsWith('/messages')) {
      await fetchConversations()
      if (activeConversationId.value) {
        if (lastMessageId) {
          await fetchMessages(activeConversationId.value, lastMessageId)
        }
        else {
          await fetchMessages(activeConversationId.value)
        }
      }
    }
  }

  function startPolling() {
    if (pollingStarted) return
    stopPolling()
    if (!canUseMessages.value) return
    pollingStarted = true
    void fetchUnreadCount()
    pollTimer = setInterval(() => { void pollActive() }, DM_POLL_MS)
  }

  function stopPolling() {
    pollingStarted = false
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  onMounted(() => {
    if (canUseMessages.value) startPolling()
  })

  onUnmounted(stopPolling)

  watch(canUseMessages, (allowed) => {
    if (allowed) startPolling()
    else stopPolling()
  })

  return {
    canUseMessages,
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    unreadTotal,
    loadingConversations,
    loadingMessages,
    sending,
    conversationSearch,
    fetchConversations,
    fetchUnreadCount,
    openConversation,
    startConversation,
    sendMessage,
    markRead,
    startPolling,
    stopPolling,
  }
}
