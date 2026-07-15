<script setup lang="ts">
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

onMounted(async () => {
  await dm.fetchConversations()
  const convId = useRoute().query.conversation as string | undefined
  if (convId) {
    await dm.openConversation(convId)
    showThread.value = true
  }
})

watch(() => dm.conversationSearch, () => {
  void dm.fetchConversations()
})

async function loadStaffUsers() {
  staffLoading.value = true
  try {
    const res = await $fetch<{ items: typeof staffUsers.value }>('/api/messages/staff-users', {
      query: { q: staffSearch.value || undefined, page: 1, pageSize: 30 },
    })
    staffUsers.value = res.items
  }
  finally {
    staffLoading.value = false
  }
}

function openNewDm() {
  newDmOpen.value = true
  staffSearch.value = ''
  void loadStaffUsers()
}

async function pickStaffUser(userId: string) {
  newDmOpen.value = false
  await dm.startConversation(userId)
  showThread.value = true
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
          <div v-if="dm.loadingConversations" class="dm-list-empty">Loading…</div>
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
        @input="loadStaffUsers"
      >
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
        <div v-else-if="!staffUsers.length" class="dm-list-empty">No staff found</div>
      </div>
    </div>
  </section>
</template>
