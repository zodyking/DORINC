<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({
  layout: 'staff',
  permission: 'messages.read.own',
})

const auth = useAuthStore()
const dm = useDirectMessages()

const showThread = ref(false)
const newDmOpen = ref(false)
const staffSearch = ref('')
const staffUsers = ref<Array<{ id: string, name: string, email: string, accountType: string }>>([])
const staffLoading = ref(false)
const staffError = ref('')
const dmStartError = ref('')

onMounted(async () => {
  await dm.fetchConversations()
  const convId = useRoute().query.conversation as string | undefined
  if (convId) {
    await dm.openConversation(convId)
    showThread.value = true
  }
})

let conversationSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => dm.conversationSearch, () => {
  if (conversationSearchTimer) clearTimeout(conversationSearchTimer)
  conversationSearchTimer = setTimeout(() => { void dm.fetchConversations() }, 300)
})

async function loadStaffUsers() {
  staffLoading.value = true
  staffError.value = ''
  try {
    const res = await $fetch<{ items: typeof staffUsers.value }>('/api/messages/staff-users', {
      query: { q: staffSearch.value || undefined, page: 1, pageSize: 30 },
    })
    staffUsers.value = res.items
  }
  catch (e: unknown) {
    staffError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not load staff users'
    staffUsers.value = []
  }
  finally {
    staffLoading.value = false
  }
}

function openNewDm() {
  newDmOpen.value = true
  staffSearch.value = ''
  staffError.value = ''
  dmStartError.value = ''
  void loadStaffUsers()
}

let staffSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(staffSearch, () => {
  if (staffSearchTimer) clearTimeout(staffSearchTimer)
  staffSearchTimer = setTimeout(() => { void loadStaffUsers() }, 300)
})

async function pickStaffUser(userId: string) {
  dmStartError.value = ''
  try {
    await dm.startConversation(userId)
    newDmOpen.value = false
    showThread.value = true
  }
  catch (e: unknown) {
    dmStartError.value = syncFetchErrorMessage(e, 'Could not start conversation')
  }
}

async function selectConversation(id: string) {
  await dm.openConversation(id)
  showThread.value = true
}

async function onSend(body: string) {
  await dm.sendMessage(body)
}

function onBack() {
  showThread.value = false
}
</script>

<template>
  <section class="page active dm-page">
    <StaffPageHead title="Messages" subtitle="Direct messages with your team">
      <template #actions>
        <button type="button" class="btn primary" @click="openNewDm">
          ✉ New message
        </button>
      </template>
    </StaffPageHead>

    <div v-if="dm.fetchError" class="dm-fetch-error">
      {{ dm.fetchError }}
      <button type="button" class="btn sm" @click="dm.fetchConversations()">Retry</button>
    </div>

    <div class="dm-layout" :class="{ 'show-thread': showThread }">
      <aside class="dm-sidebar">
        <div class="dm-sidebar-head">
          <input
            v-model="dm.conversationSearch"
            type="search"
            class="dm-search"
            placeholder="Search conversations…"
            aria-label="Search conversations"
          >
        </div>
        <div class="dm-conv-list">
          <div v-if="dm.loadingConversations && !dm.conversations.length" class="dm-list-empty">Loading…</div>
          <MessagingConversationList
            v-for="conv in dm.conversations"
            :key="conv.id"
            :conversation="conv"
            :active="conv.id === dm.activeConversationId"
            @select="selectConversation"
          />
          <div v-if="!dm.loadingConversations && !dm.conversations.length && !dm.fetchError" class="dm-list-empty">
            <b>No conversations yet</b>
            <span>Start a new message to chat with a teammate.</span>
          </div>
        </div>
      </aside>

      <MessagingChatThread
        class="dm-main"
        :conversation="dm.activeConversation"
        :messages="dm.messages"
        :loading="dm.loadingMessages"
        :current-user-id="auth.user?.id"
        @back="onBack"
        @send="onSend"
      />
    </div>

    <div v-if="newDmOpen" class="dm-modal-scrim" @click="newDmOpen = false" />
    <div v-if="newDmOpen" class="dm-modal" role="dialog" aria-label="New message">
      <header class="dm-modal-head">
        <b>New message</b>
        <button type="button" class="xbtn" aria-label="Close" @click="newDmOpen = false">✕</button>
      </header>
      <input
        v-model="staffSearch"
        type="search"
        class="dm-search"
        placeholder="Search staff…"
        aria-label="Search staff"
      >
      <p v-if="dmStartError" class="dm-fetch-error" style="margin:0 12px 8px;">{{ dmStartError }}</p>
      <div class="dm-staff-list">
        <button
          v-for="user in staffUsers"
          :key="user.id"
          type="button"
          class="dm-staff-item"
          @click="pickStaffUser(user.id)"
        >
          <b>{{ user.name }}</b>
          <small>{{ user.email }}</small>
        </button>
        <div v-if="staffLoading" class="dm-list-empty">Loading…</div>
        <div v-else-if="staffError" class="dm-list-empty">{{ staffError }}</div>
        <div v-else-if="!staffUsers.length" class="dm-list-empty">No staff found</div>
      </div>
    </div>
  </section>
</template>
