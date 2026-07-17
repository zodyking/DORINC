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

export interface TeamConversationSummary {
  id: string
  type: 'team'
  title: string
  isSystem: boolean
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

export type ConversationSummary = DmConversationSummary | EmailConversationSummary | TeamConversationSummary

export interface EmailAttachment {
  id: string
  filename: string
  mimeType: string
  fileSizeBytes: number
}

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
  hasHtmlBody?: boolean
  htmlBody?: string | null
  fromAddress?: string | null
  attachments?: EmailAttachment[]
}

export type MessageChannel = 'dm' | 'email'

function normalizeMessageChannel(value: string): MessageChannel {
  return value === 'email' ? 'email' : 'dm'
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
  const messageChannel = useState<string>('dm-message-channel', () => 'dm')
  const emailShowAll = useState('dm-email-show-all', () => false)
  const fetchError = useState<string | null>('dm-fetch-error', () => null)

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastMessageId: string | null = null
  let pollingStarted = false

  function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
    if (!incoming.length) return existing
    const seen = new Set(existing.map(m => m.id))
    const merged = [...existing]
    for (const msg of incoming) {
      if (!seen.has(msg.id)) {
        merged.push(msg)
        seen.add(msg.id)
      }
    }
    return merged
  }

  const canUseMessages = computed(() => auth.can('messages.read.own'))
  const activeConversation = computed(() =>
    conversations.value.find(c => c.id === activeConversationId.value) ?? null,
  )
  const activeIsEmail = computed(() => activeConversation.value?.type === 'email')
const activeIsTeam = computed(() => activeConversation.value?.type === 'team')

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
          channel: normalizeMessageChannel(messageChannel.value),
          emailScope: normalizeMessageChannel(messageChannel.value) === 'email' && emailShowAll.value ? 'all' : 'customers',
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
          messages.value = mergeMessages(messages.value, res.items)
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
    await Promise.all([
      fetchMessages(conversationId),
      markRead(conversationId),
    ])
  }

  async function markRead(conversationId: string) {
    try {
      await $fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' })
      const conv = conversations.value.find(c => c.id === conversationId)
      if (conv) conv.unreadCount = 0
      void fetchUnreadCount()
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

  async function startEmailThread(
    input: { customerId: string, toEmail: string, subject: string, body: string },
    files?: File[],
  ) {
    if (sending.value) return
    sending.value = true
    try {
      const conv = await $fetch<{ conversationId: string }>('/api/conversations/email', {
        method: 'POST',
        body: files?.length ? buildEmailFormData(input, files) : input,
      })
      messageChannel.value = 'email'
      await fetchConversations()
      await openConversation(conv.conversationId)
      return conv
    }
    finally {
      sending.value = false
    }
  }

  async function sendMessage(body: string, files?: File[]) {
    if (!activeConversationId.value || sending.value) return
    if (!body.trim() && !files?.length) return
    sending.value = true
    try {
      let payload: FormData | { body: string }
      if (files?.length) {
        const form = new FormData()
        form.append('body', body.trim())
        for (const file of files) form.append('files', file, file.name)
        payload = form
      }
      else {
        payload = { body: body.trim() }
      }

      const msg = await $fetch<ChatMessage>(`/api/conversations/${activeConversationId.value}/messages`, {
        method: 'POST',
        body: payload,
      })
      messages.value = mergeMessages(messages.value, [msg])
      lastMessageId = msg.id
      await fetchConversations({ silent: true })
      await fetchUnreadCount()
    }
    finally {
      sending.value = false
    }
  }

  function buildEmailFormData(
    input: { customerId: string, toEmail: string, subject: string, body: string },
    files: File[],
  ): FormData {
    const form = new FormData()
    form.append('customerId', input.customerId)
    form.append('toEmail', input.toEmail)
    form.append('subject', input.subject)
    form.append('body', input.body)
    for (const file of files) form.append('files', file, file.name)
    return form
  }

  async function setChannel(channel: MessageChannel) {
    const next = normalizeMessageChannel(channel)
    if (normalizeMessageChannel(messageChannel.value) === next) return
    messageChannel.value = next
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
        if (!messages.value.length) {
          await fetchMessages(activeConversationId.value, undefined, { silent: true })
        }
        else if (lastMessageId) {
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

  function onVisibilityChange() {
    if (typeof document === 'undefined') return
    if (document.hidden) stopPolling()
    else if (canUseMessages.value) startPolling()
  }

  onMounted(() => {
    if (canUseMessages.value) startPolling()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
  })

  onUnmounted(() => {
    stopPolling()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  })

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
