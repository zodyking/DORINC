// Live staff messaging — DMs + shared customer email threads.

import { DM_POLL_MS } from '~/utils/messages-ui'

export interface DmConversationSummary {
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

export interface EmailConversationSummary {
  id: string
  type: 'email'
  customer: { id: string | null, name: string, email: string } | null
  subject: string
  lastMessage: {
    id: string
    body: string
    senderUserId: string | null
    senderName: string | null
    direction: 'inbound' | 'outbound'
    createdAt: string
    preview: string
  } | null
  unreadCount: number
  updatedAt: string
}

export type ConversationSummary = DmConversationSummary | EmailConversationSummary

export interface ChatMessage {
  id: string
  conversationId: string
  body: string
  senderUserId: string | null
  senderName: string
  createdAt: string
  entityRefs: Array<{ entityType: string, entityId: string, entityLabel: string }>
  channel?: 'email'
  direction?: 'inbound' | 'outbound'
  htmlBody?: string | null
}

export type MessageChannel = 'all' | 'dm' | 'email'

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
  const messageChannel = useState<MessageChannel>('dm-message-channel', () => 'all')
  const emailShowAll = useState('dm-email-show-all', () => false)
  const fetchError = useState<string | null>('dm-fetch-error', () => null)

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastMessageId: string | null = null
  let pollingStarted = false

  const canUseMessages = computed(() => auth.can('messages.read.own'))
  const activeConversation = computed(() =>
    conversations.value.find(c => c.id === activeConversationId.value) ?? null,
  )
  const activeIsEmail = computed(() => activeConversation.value?.type === 'email')

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

  async function fetchConversations(options?: { silent?: boolean }) {
    if (!canUseMessages.value) return
    const silent = options?.silent ?? false
    if (!silent || !conversations.value.length) {
      loadingConversations.value = !silent
    }
    fetchError.value = null
    try {
      const res = await $fetch<{ items: ConversationSummary[] }>('/api/conversations', {
        query: {
          q: conversationSearch.value || undefined,
          channel: messageChannel.value,
          emailScope: messageChannel.value === 'email' && emailShowAll.value ? 'all' : 'customers',
          page: 1,
          pageSize: 50,
        },
      })
      conversations.value = res.items
    }
    catch (e) {
      fetchError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not load conversations'
    }
    finally {
      loadingConversations.value = false
    }
  }

  async function fetchMessages(conversationId: string, afterId?: string, options?: { silent?: boolean }) {
    if (!canUseMessages.value) return
    const silent = options?.silent ?? false
    if (!afterId && !silent) loadingMessages.value = true
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
      if (!afterId && !silent) loadingMessages.value = false
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
    messageChannel.value = 'dm'
    await fetchConversations()
    await openConversation(conv.id)
    return conv
  }

  async function startEmailThread(input: { customerId: string, toEmail: string, subject: string, body: string }) {
    const conv = await $fetch<{ conversationId: string }>('/api/conversations/email', {
      method: 'POST',
      body: input,
    })
    messageChannel.value = 'email'
    await fetchConversations()
    await openConversation(conv.conversationId)
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
      await fetchConversations({ silent: true })
      await fetchUnreadCount()
    }
    finally {
      sending.value = false
    }
  }

  async function setChannel(channel: MessageChannel) {
    if (messageChannel.value === channel) return
    messageChannel.value = channel
    activeConversationId.value = null
    messages.value = []
    await fetchConversations()
  }

  async function setEmailShowAll(showAll: boolean) {
    if (emailShowAll.value === showAll) return
    emailShowAll.value = showAll
    activeConversationId.value = null
    messages.value = []
    await fetchConversations()
  }

  async function pollActive() {
    if (!canUseMessages.value) return
    await fetchUnreadCount()
    if (route.path.startsWith('/messages')) {
      await fetchConversations({ silent: true })
      if (activeConversationId.value) {
        if (lastMessageId) {
          await fetchMessages(activeConversationId.value, lastMessageId, { silent: true })
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

  return reactive({
    conversations,
    activeConversationId,
    activeConversation,
    activeIsEmail,
    messages,
    unreadTotal,
    loadingConversations,
    loadingMessages,
    sending,
    conversationSearch,
    messageChannel,
    emailShowAll,
    fetchError,
    canUseMessages,
    fetchConversations,
    fetchUnreadCount,
    openConversation,
    startConversation,
    startEmailThread,
    sendMessage,
    markRead,
    setChannel,
    setEmailShowAll,
    startPolling,
    stopPolling,
  })
}
