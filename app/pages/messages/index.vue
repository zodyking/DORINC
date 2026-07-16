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
const newEmailOpen = ref(false)
const staffSearch = ref('')
const staffUsers = ref<Array<{ id: string, name: string, email: string, accountType: string }>>([])
const staffLoading = ref(false)
const staffError = ref('')
const dmStartError = ref('')

const customerSearch = ref('')
const customerRecipients = ref<Array<{ customerId: string, label: string, email: string }>>([])
const customerLoading = ref(false)
const customerError = ref('')
const emailStartError = ref('')
const emailForm = reactive({
  recipientKey: '',
  customerId: '',
  toEmail: '',
  subject: '',
  body: '',
})
const emailAttachments = ref<File[]>([])
const emailAttachError = ref('')
const emailFileInput = ref<HTMLInputElement | null>(null)

const EMAIL_ATTACH_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf'
const EMAIL_ATTACH_ALLOWED = new Set(EMAIL_ATTACH_ACCEPT.split(','))
const EMAIL_MAX_ATTACHMENTS = 10
const EMAIL_MAX_ATTACH_MB = 25

function formatAttachSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function onEmailFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  const errors: string[] = []
  for (const file of picked) {
    if (emailAttachments.value.length >= EMAIL_MAX_ATTACHMENTS) {
      errors.push(`Up to ${EMAIL_MAX_ATTACHMENTS} attachments allowed`)
      break
    }
    if (file.type && !EMAIL_ATTACH_ALLOWED.has(file.type)) {
      errors.push(`${file.name}: unsupported type`)
      continue
    }
    if (file.size > EMAIL_MAX_ATTACH_MB * 1024 * 1024) {
      errors.push(`${file.name}: exceeds ${EMAIL_MAX_ATTACH_MB} MB`)
      continue
    }
    if (emailAttachments.value.some(f => f.name === file.name && f.size === file.size)) continue
    emailAttachments.value.push(file)
  }
  emailAttachError.value = errors.join(' · ')
}

function removeEmailAttachment(index: number) {
  emailAttachments.value.splice(index, 1)
}

const hasActiveConversation = computed(() => !!dm.activeConversation)
const showThreadPanel = computed(() => showThread.value && hasActiveConversation.value)

function revealThread() {
  if (dm.activeConversation) showThread.value = true
}

onMounted(async () => {
  await dm.fetchConversations()
  const convId = useRoute().query.conversation as string | undefined
  if (convId) {
    await dm.openConversation(convId)
    revealThread()
  }
})

let conversationSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => dm.conversationSearch, () => {
  if (conversationSearchTimer) clearTimeout(conversationSearchTimer)
  conversationSearchTimer = setTimeout(() => { void dm.fetchConversations() }, 300)
})

watch(() => dm.messageChannel, () => {
  showThread.value = false
})

watch(() => dm.activeConversationId, (id) => {
  if (!id) showThread.value = false
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

async function loadCustomerRecipients() {
  customerLoading.value = true
  customerError.value = ''
  try {
    const res = await $fetch<{ items: typeof customerRecipients.value }>('/api/messages/customer-recipients', {
      query: { q: customerSearch.value || undefined },
    })
    customerRecipients.value = res.items
  }
  catch (e: unknown) {
    customerError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not load customers'
    customerRecipients.value = []
  }
  finally {
    customerLoading.value = false
  }
}

function openNewDm() {
  newDmOpen.value = true
  staffSearch.value = ''
  staffError.value = ''
  dmStartError.value = ''
  void loadStaffUsers()
}

function openNewEmail() {
  newEmailOpen.value = true
  customerSearch.value = ''
  customerError.value = ''
  emailStartError.value = ''
  emailForm.recipientKey = ''
  emailForm.customerId = ''
  emailForm.toEmail = ''
  emailForm.subject = ''
  emailForm.body = ''
  emailAttachments.value = []
  emailAttachError.value = ''
  void loadCustomerRecipients()
}

let staffSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(staffSearch, () => {
  if (staffSearchTimer) clearTimeout(staffSearchTimer)
  staffSearchTimer = setTimeout(() => { void loadStaffUsers() }, 300)
})

let customerSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(customerSearch, () => {
  if (customerSearchTimer) clearTimeout(customerSearchTimer)
  customerSearchTimer = setTimeout(() => { void loadCustomerRecipients() }, 300)
})

async function pickStaffUser(userId: string) {
  dmStartError.value = ''
  try {
    await dm.startConversation(userId)
    newDmOpen.value = false
    revealThread()
  }
  catch (e: unknown) {
    dmStartError.value = syncFetchErrorMessage(e, 'Could not start conversation')
  }
}

async function submitNewEmail() {
  emailStartError.value = ''
  if (dm.sending) return
  if (!emailForm.customerId || !emailForm.toEmail || !emailForm.subject.trim() || !emailForm.body.trim()) {
    emailStartError.value = 'Customer, subject, and message are required'
    return
  }
  try {
    await dm.startEmailThread({
      customerId: emailForm.customerId,
      toEmail: emailForm.toEmail,
      subject: emailForm.subject.trim(),
      body: emailForm.body.trim(),
    }, emailAttachments.value.slice())
    newEmailOpen.value = false
    revealThread()
  }
  catch (e: unknown) {
    emailStartError.value = syncFetchErrorMessage(e, 'Could not send email')
  }
}

async function selectConversation(id: string) {
  dm.activeConversationId = id
  revealThread()
  await dm.openConversation(id)
}

async function onSend(body: string, files: File[]) {
  await dm.sendMessage(body, files)
}

function onBack() {
  showThread.value = false
}

async function onDeletionRequested() {
  showThread.value = false
  dm.activeConversationId = null
  dm.messages = []
  await dm.fetchConversations()
}

async function setChannel(channel: 'dm' | 'email') {
  await dm.setChannel(channel)
}

async function setEmailShowAll(showAll: boolean) {
  await dm.setEmailShowAll(showAll)
}
</script>

<template>
  <section class="page active dm-page" :class="{ 'dm-page--in-thread': showThreadPanel }">
    <StaffPageHead title="Messages" subtitle="Team chat and shared customer email threads">
      <template #actions>
        <button type="button" class="btn" @click="openNewEmail">
          New email
        </button>
        <button type="button" class="btn primary" @click="openNewDm">
          ✉ New message
        </button>
      </template>
    </StaffPageHead>

    <div v-if="dm.fetchError" class="dm-fetch-error">
      {{ dm.fetchError }}
      <button type="button" class="btn sm" @click="dm.fetchConversations()">Retry</button>
    </div>

    <div class="dm-layout" :class="{ 'show-thread': showThreadPanel }">
      <aside class="dm-sidebar">
        <div class="dm-sidebar-head">
          <div class="dm-sidebar-actions">
            <button type="button" class="btn primary" aria-label="New message" @click="openNewDm">
              New message
            </button>
            <button type="button" class="btn" aria-label="New email" @click="openNewEmail">
              New email
            </button>
          </div>
          <div class="dm-channel-tabs" role="tablist" aria-label="Message channels">
            <button
              type="button"
              role="tab"
              class="dm-channel-tab"
              :class="{ on: dm.messageChannel === 'dm' }"
              :aria-selected="dm.messageChannel === 'dm'"
              @click="setChannel('dm')"
            >
              Team
            </button>
            <button
              type="button"
              role="tab"
              class="dm-channel-tab"
              :class="{ on: dm.messageChannel === 'email' }"
              :aria-selected="dm.messageChannel === 'email'"
              @click="setChannel('email')"
            >
              Email
            </button>
          </div>
          <div
            v-if="dm.messageChannel === 'email'"
            class="dm-email-filter"
            role="group"
            aria-label="Email inbox filter"
          >
            <button
              type="button"
              class="dm-email-filter-opt"
              :class="{ on: !dm.emailShowAll }"
              @click="setEmailShowAll(false)"
            >
              Customers
            </button>
            <button
              type="button"
              class="dm-email-filter-opt"
              :class="{ on: dm.emailShowAll }"
              @click="setEmailShowAll(true)"
            >
              Show all
            </button>
          </div>
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
            <span v-if="dm.messageChannel === 'email'">Sync your inbox in Control Panel or start a new customer email.</span>
            <span v-else>Start a new message to chat with a teammate.</span>
          </div>
        </div>
      </aside>

      <div class="dm-main">
        <MessagingChatThread
          :conversation="dm.activeConversation"
          :messages="dm.messages"
          :loading="dm.loadingMessages"
          :sending="dm.sending"
          :current-user-id="auth.user?.id"
          @back="onBack"
          @send="onSend"
          @deletion-requested="onDeletionRequested"
        />
      </div>
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

    <div v-if="newEmailOpen" class="dm-modal-scrim" @click="newEmailOpen = false" />
    <div v-if="newEmailOpen" class="dm-modal dm-modal-wide" role="dialog" aria-label="New email">
      <header class="dm-modal-head">
        <b>New customer email</b>
        <button type="button" class="xbtn" aria-label="Close" @click="newEmailOpen = false">✕</button>
      </header>
      <div class="dm-modal-body dm-email-form">
        <input
          v-model="customerSearch"
          type="search"
          class="dm-search"
          placeholder="Search customers…"
          aria-label="Search customers"
        >
        <label class="fld">
          To
          <select
            v-model="emailForm.recipientKey"
            required
            aria-label="Customer recipient"
            @change="(e) => {
              const key = (e.target as HTMLSelectElement).value
              const item = customerRecipients.find(r => `${r.customerId}:${r.email}` === key)
              emailForm.customerId = item?.customerId ?? ''
              emailForm.toEmail = item?.email ?? ''
            }"
          >
            <option value="" disabled>Select customer…</option>
            <option
              v-for="item in customerRecipients"
              :key="`${item.customerId}-${item.email}`"
              :value="`${item.customerId}:${item.email}`"
            >
              {{ item.label }}
            </option>
          </select>
        </label>
        <label class="fld">
          Subject
          <input v-model="emailForm.subject" type="text" maxlength="500" placeholder="Subject line" required>
        </label>
        <label class="fld">
          Message
          <textarea v-model="emailForm.body" rows="5" maxlength="50000" placeholder="Write your email…" required />
        </label>
        <div class="fld">
          <span>Attachments</span>
          <div class="dm-email-attach-row">
            <input
              ref="emailFileInput"
              type="file"
              class="dm-compose-file-input"
              :accept="EMAIL_ATTACH_ACCEPT"
              multiple
              @change="onEmailFilesSelected"
            >
            <button type="button" class="btn sm" @click="emailFileInput?.click()">
              📎 Add files or images
            </button>
          </div>
          <div v-if="emailAttachments.length" class="dm-compose-attachments">
            <div
              v-for="(file, i) in emailAttachments"
              :key="`${file.name}-${file.size}-${i}`"
              class="dm-compose-chip"
            >
              <span class="dm-compose-chip-icon" aria-hidden="true">{{ file.type.startsWith('image/') ? '🖼️' : '📎' }}</span>
              <span class="dm-compose-chip-name" :title="file.name">{{ file.name }}</span>
              <small class="dm-compose-chip-size">{{ formatAttachSize(file.size) }}</small>
              <button
                type="button"
                class="dm-compose-chip-remove"
                :aria-label="`Remove ${file.name}`"
                @click="removeEmailAttachment(i)"
              >
                ✕
              </button>
            </div>
          </div>
          <p v-if="emailAttachError" class="dm-compose-attach-error">{{ emailAttachError }}</p>
        </div>
        <div v-if="customerLoading" class="dm-list-empty">Loading customers…</div>
        <div v-else-if="customerError" class="dm-list-empty">{{ customerError }}</div>
      </div>
      <footer class="dm-modal-footer">
        <p v-if="emailStartError" class="dm-fetch-error" style="margin:0;">{{ emailStartError }}</p>
        <button type="button" class="btn primary" :disabled="customerLoading || dm.sending" @click="submitNewEmail">
          {{ dm.sending ? 'Sending…' : 'Send email' }}
        </button>
      </footer>
    </div>
  </section>
</template>
