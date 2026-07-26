<script setup lang="ts">
/**
 * Hands-on practice for Messages, built from the real interface: the same
 * channel tabs, conversation list, thread bubbles, composer and entity picker
 * classes the Messages page uses — and the real `detectEntityTrigger` so typing
 * "invoice" behaves exactly like production. Nothing here calls the API.
 */
import type { MessageEntityType } from '~/server/db/schema/messages'
import { detectEntityTrigger, ENTITY_TYPE_LABELS } from '~/utils/messages-ui'

const props = defineProps<{ practiceId: string }>()
const emit = defineEmits<{ ready: [ready: boolean] }>()

type Kind = 'tab' | 'thread' | 'reply' | 'attach' | 'recipient' | 'compose' | 'send'

interface Task {
  kind: Kind
  channel: 'dm' | 'email'
  ask: string
  done: string
  target?: string
}

const TASKS: Record<string, Task> = {
  'msg-team-tab': {
    kind: 'tab', channel: 'dm', target: 'dm',
    ask: 'Open the internal team conversation.',
    done: 'That is the Team channel — internal only. Customers never see it.',
  },
  'msg-attach-record': {
    kind: 'attach', channel: 'dm',
    ask: 'Type "invoice" in the message box, then pick INV-000318 from the list.',
    done: 'Attached. The number became a link your coworker can open.',
  },
  'msg-email-tab': {
    kind: 'tab', channel: 'email', target: 'email',
    ask: 'Customers email you all day. Open the channel where those threads live.',
    done: 'Email holds every customer thread, with their attachments.',
  },
  'msg-open-thread': {
    kind: 'thread', channel: 'email', target: 'thread-acme',
    ask: 'Open the unread email from Acme Fleet Services.',
    done: 'Opened. Read the whole thread before replying — context is usually above.',
  },
  'msg-reply': {
    kind: 'reply', channel: 'email', target: 'send',
    ask: 'Answer on this thread instead of starting a new one.',
    done: 'Replying keeps the history in one thread.',
  },
  'msg-pick-customer': {
    kind: 'recipient', channel: 'email', target: 'cust-acme',
    ask: 'Choose Acme Fleet Services as the recipient.',
    done: 'Recipient set. The address comes from their customer record.',
  },
  'msg-compose': {
    kind: 'compose', channel: 'email',
    ask: 'Write a subject that names the record, and a short message.',
    done: 'Good — a subject that names the record is what makes a thread findable.',
  },
  'msg-send': {
    kind: 'send', channel: 'email', target: 'send',
    ask: 'Send the email.',
    done: 'Sent. It is now a thread you and the customer both see.',
  },
}

const task = computed(() => TASKS[props.practiceId])

const channel = ref<'dm' | 'email' | null>(null)
const openThread = ref<string | null>(null)
const clicked = ref<string | null>(null)
const recipient = ref('')
const subject = ref('')
const body = ref('')

/* ── Real composer behaviour: type a keyword, get the entity picker ── */
const draft = ref('')
const attached = ref<{ type: MessageEntityType, label: string } | null>(null)
const pickerType = ref<MessageEntityType | null>(null)
const pickerStart = ref(0)
const pickerEnd = ref(0)

const PICKER_ITEMS: Record<MessageEntityType, Array<{ label: string, sublabel: string }>> = {
  invoice: [
    { label: 'INV-000318', sublabel: 'Acme Fleet Services · $519.98 · Draft' },
    { label: 'INV-000301', sublabel: 'Acme Fleet Services · $0.00 · Paid' },
  ],
  customer: [
    { label: 'Acme Fleet Services', sublabel: 'Fleet · 14 vehicles' },
    { label: 'Metro Transit Co.', sublabel: 'Fleet · 32 vehicles' },
  ],
  vehicle: [
    { label: 'Truck #HL-114', sublabel: 'Acme Fleet Services · Freightliner M2' },
    { label: 'Truck #HL-108', sublabel: 'Acme Fleet Services · Freightliner M2' },
  ],
  service_log: [
    { label: 'SL-1042', sublabel: 'Acme Fleet Services · Ready for review' },
    { label: 'SL-1039', sublabel: 'Acme Fleet Services · Needs info' },
  ],
}

const pickerItems = computed(() => (pickerType.value ? PICKER_ITEMS[pickerType.value] : []))

function onDraftInput() {
  const trigger = detectEntityTrigger(draft.value, draft.value.length)
  if (trigger) {
    pickerType.value = trigger.entityType
    pickerStart.value = trigger.start
    pickerEnd.value = trigger.end
  }
  else {
    pickerType.value = null
  }
}

function insertEntity(item: { label: string }) {
  if (!pickerType.value) return
  attached.value = { type: pickerType.value, label: item.label }
  // Real composer replaces the typed keyword with the entity chip.
  draft.value = `${draft.value.slice(0, pickerStart.value)}${draft.value.slice(pickerEnd.value)}`.trimEnd()
  pickerType.value = null
}

const ready = computed(() => {
  const t = task.value
  if (!t) return false
  switch (t.kind) {
    case 'tab': return channel.value === t.target
    case 'thread': return openThread.value === t.target
    case 'attach': return attached.value?.label === 'INV-000318'
    case 'recipient': return recipient.value === t.target
    case 'compose': return subject.value.trim().length >= 3 && body.value.trim().length >= 3
    case 'reply':
    case 'send': return clicked.value === t.target
    default: return false
  }
})

watch(ready, v => emit('ready', v), { immediate: true })

const wrong = computed(() => {
  const t = task.value
  if (!t || ready.value) return false
  if (t.kind === 'tab') return channel.value != null
  if (t.kind === 'thread') return openThread.value != null
  if (t.kind === 'recipient') return recipient.value !== ''
  if (t.kind === 'reply' || t.kind === 'send') return clicked.value != null
  if (t.kind === 'attach') return attached.value != null
  return false
})

/** Tabs start on the channel the task belongs to, except when picking is the task. */
onMounted(() => {
  if (task.value && task.value.kind !== 'tab') channel.value = task.value.channel
  if (task.value?.kind === 'reply') openThread.value = 'thread-acme'
})

const threads = [
  { id: 'thread-acme', who: 'Acme Fleet Services', subject: 'Invoice INV-000318 question', preview: 'Can you break down the labor hours on this one?', unread: 2 },
  { id: 'thread-metro', who: 'Metro Transit Co.', subject: 'Bus 4102 back in service?', preview: 'Just checking whether 4102 is ready for Monday.', unread: 0 },
]
</script>

<template>
  <div v-if="task" class="training-practice-wizard">
    <div class="training-practice-badge">Practice — {{ task.ask }}</div>

    <div class="training-ui-chrome">
      <!-- Real channel tabs -->
      <div class="dm-channel-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="dm-channel-tab"
          :class="{ on: channel === 'dm' }"
          @click="channel = 'dm'"
        >
          Team
        </button>
        <button
          type="button"
          role="tab"
          class="dm-channel-tab"
          :class="{ on: channel === 'email' }"
          @click="channel = 'email'"
        >
          Email
        </button>
      </div>

      <div class="training-ui-chrome-body">
        <!-- Pick a customer thread from the real conversation list -->
        <div v-if="task.kind === 'thread'" class="dm-conv-list">
          <button
            v-for="t in threads"
            :key="t.id"
            type="button"
            class="dm-conv-item"
            :class="{ on: openThread === t.id }"
            @click="openThread = t.id"
          >
            <span class="dm-conv-av">{{ t.who.slice(0, 2).toUpperCase() }}</span>
            <span class="dm-conv-main">
              <span class="dm-conv-top">
                <b>{{ t.who }}</b>
                <span v-if="t.unread" class="dm-conv-badge">{{ t.unread }}</span>
              </span>
              <span class="dm-conv-subject">{{ t.subject }}</span>
              <span class="dm-conv-preview">{{ t.preview }}</span>
            </span>
          </button>
        </div>

        <!-- Team chat: type a keyword to attach a record -->
        <template v-else-if="task.kind === 'attach'">
          <div class="dm-thread-msgs" style="padding:0 0 10px;">
            <div class="dm-msg">
              <span class="dm-msg-av">DR</span>
              <div class="dm-msg-body">
                <div class="dm-msg-bubble">Which invoice is the customer asking about?</div>
              </div>
            </div>
            <div v-if="attached" class="dm-msg me">
              <div class="dm-msg-body">
                <div class="dm-msg-bubble">
                  <template v-if="draft.trim()">{{ draft.trim() }} </template>
                  <a class="dm-compose-entity-chip" href="#" @click.prevent>
                    {{ attached.label }}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div class="dm-compose">
            <!-- Real entity picker, opened by the real trigger detector -->
            <div v-if="pickerType" class="dm-entity-picker">
              <div class="dm-entity-picker-head">
                Attach {{ ENTITY_TYPE_LABELS[pickerType] }}
              </div>
              <div class="dm-entity-picker-list">
                <button
                  v-for="(item, i) in pickerItems"
                  :key="item.label"
                  type="button"
                  class="dm-entity-picker-item"
                  :class="{ on: i === 0 }"
                  @click="insertEntity(item)"
                >
                  <b>{{ item.label }}</b>
                  <small>{{ item.sublabel }}</small>
                </button>
              </div>
            </div>
            <form class="dm-compose-form" @submit.prevent>
              <div class="dm-compose-field-wrap">
                <input
                  v-model="draft"
                  class="dm-compose-input"
                  type="text"
                  placeholder="Message the team…"
                  aria-label="Message the team"
                  @input="onDraftInput"
                >
              </div>
              <button type="submit" class="dm-send-btn" aria-label="Send" disabled>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </form>
            <div class="dm-compose-hint">
              Tip: type <code>invoice</code>, <code>customer</code>, <code>vehicle</code>, or <code>service log</code> to attach links
            </div>
          </div>
        </template>

        <!-- Reply on an existing customer thread -->
        <template v-else-if="task.kind === 'reply'">
          <div class="dm-thread-head">
            <div class="dm-thread-peer"><b>Acme Fleet Services</b></div>
            <div class="dm-thread-subject">Invoice INV-000318 question</div>
          </div>
          <div class="dm-thread-msgs" style="padding:0 0 10px;">
            <div class="dm-msg">
              <span class="dm-msg-av">AF</span>
              <div class="dm-msg-body">
                <div class="dm-msg-bubble dm-msg-bubble-email">
                  Can you break down the labor hours on this one?
                </div>
              </div>
            </div>
          </div>
          <div class="dm-compose">
            <form class="dm-compose-form dm-compose-form--email" @submit.prevent="clicked = 'send'">
              <textarea
                v-model="body"
                class="dm-compose-input"
                rows="2"
                placeholder="Reply to Acme Fleet Services…"
                aria-label="Reply"
              />
              <button type="submit" class="dm-send-btn dm-send-btn--labeled">
                <span>Send</span>
              </button>
            </form>
          </div>
          <button type="button" class="btn sm" style="margin-top:8px;" @click="clicked = 'new'">
            New email
          </button>
        </template>

        <!-- Start a new customer email: the real To / Subject / Message form -->
        <template v-else-if="task.kind === 'recipient' || task.kind === 'compose' || task.kind === 'send'">
          <label class="fld">
            To
            <select v-model="recipient" aria-label="Customer recipient">
              <option value="">Select a customer…</option>
              <option value="cust-acme">Acme Fleet Services — billing@acmefleet.com</option>
              <option value="cust-metro">Metro Transit Co. — ops@metrotransit.example</option>
            </select>
          </label>
          <template v-if="task.kind !== 'recipient'">
            <label class="fld">
              Subject
              <input v-model="subject" type="text" maxlength="500" placeholder="Subject line">
            </label>
            <label class="fld">
              Message
              <textarea v-model="body" rows="3" placeholder="Write your email…" />
            </label>
          </template>
          <div v-if="task.kind === 'send'" class="dm-compose">
            <form class="dm-compose-form dm-compose-form--email" @submit.prevent="clicked = 'send'">
              <button type="submit" class="dm-send-btn dm-send-btn--labeled">
                <span>Send</span>
              </button>
            </form>
          </div>
        </template>

        <p v-if="ready" class="training-ui-hint">{{ task.done }}</p>
        <p v-else-if="wrong" class="help" style="margin:8px 0 0;color:#dc2626;">
          Not that one — try again.
        </p>
        <p v-else class="training-ui-hint muted">{{ task.ask }}</p>
      </div>
    </div>
  </div>

  <p v-else class="help">Unknown practice step.</p>
</template>
