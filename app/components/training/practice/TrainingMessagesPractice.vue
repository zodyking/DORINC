<script setup lang="ts">
/**
 * Hands-on practice for Messages: the team channel, record references, and
 * customer email (read, reply, compose). Mirrors the real Messages screen —
 * nothing here calls the API.
 */
const props = defineProps<{ practiceId: string }>()

const emit = defineEmits<{ ready: [ready: boolean] }>()

type Kind = 'tab' | 'pick' | 'compose' | 'action'

interface Task {
  kind: Kind
  /** Instruction shown above the mock screen. */
  ask: string
  /** Confirmation once the learner gets it right. */
  done: string
  /** Correct id for `tab` / `pick` / `action` tasks. */
  target?: string
}

const TASKS: Record<string, Task> = {
  'msg-team-tab': {
    kind: 'tab',
    target: 'team',
    ask: 'Open the internal team conversation.',
    done: 'That is the Team channel — internal only. Customers never see it.',
  },
  'msg-attach-record': {
    kind: 'action',
    target: 'attach',
    ask: 'Attach the invoice you are discussing so the next person has the context.',
    done: 'Reference attached. Anyone reading can jump straight to INV-000318.',
  },
  'msg-email-tab': {
    kind: 'tab',
    target: 'email',
    ask: 'Customers email you all day. Open the channel where those threads live.',
    done: 'Email holds every customer thread, with their attachments.',
  },
  'msg-open-thread': {
    kind: 'pick',
    target: 'thread-acme',
    ask: 'Open the unread email from Acme Fleet Services.',
    done: 'Opened. Read the whole thread before replying — context is usually above.',
  },
  'msg-reply': {
    kind: 'action',
    target: 'reply',
    ask: 'Reply on the existing thread instead of starting a new one.',
    done: 'Replying keeps it in one thread, so nothing gets lost.',
  },
  'msg-pick-customer': {
    kind: 'pick',
    target: 'cust-acme',
    ask: 'You need to email Acme Fleet Services. Choose them as the recipient.',
    done: 'Recipient set. The address comes from their customer record.',
  },
  'msg-compose': {
    kind: 'compose',
    ask: 'Write a subject and a short message, then it is ready to send.',
    done: 'Good — a clear subject is what makes a thread findable later.',
  },
  'msg-send': {
    kind: 'action',
    target: 'send',
    ask: 'Send the email.',
    done: 'Sent. It is now a thread you and the customer both see.',
  },
}

const task = computed(() => TASKS[props.practiceId])

const tab = ref<'team' | 'email' | null>(null)
const picked = ref<string | null>(null)
const clicked = ref<string | null>(null)
const subject = ref('')
const body = ref('')

const ready = computed(() => {
  const t = task.value
  if (!t) return false
  if (t.kind === 'tab') return tab.value === t.target
  if (t.kind === 'pick') return picked.value === t.target
  if (t.kind === 'action') return clicked.value === t.target
  return subject.value.trim().length >= 3 && body.value.trim().length >= 3
})

watch(ready, v => emit('ready', v), { immediate: true })

const wrong = computed(() => {
  const t = task.value
  if (!t || ready.value) return false
  if (t.kind === 'tab') return tab.value != null
  if (t.kind === 'pick') return picked.value != null
  if (t.kind === 'action') return clicked.value != null
  return false
})

const threads = [
  { id: 'thread-acme', who: 'Acme Fleet Services', subject: 'Invoice INV-000318 question', unread: true },
  { id: 'thread-metro', who: 'Metro Transit Co.', subject: 'Bus 4102 back in service?', unread: false },
]

const customers = [
  { id: 'cust-acme', name: 'Acme Fleet Services', email: 'billing@acmefleet.com' },
  { id: 'cust-metro', name: 'Metro Transit Co.', email: 'ops@metrotransit.example' },
]
</script>

<template>
  <div v-if="task" class="training-practice-wizard">
    <div class="training-practice-badge">Practice — {{ task.ask }}</div>

    <div class="training-ui-chrome">
      <!-- Channel tabs: the real Messages screen splits Team from customer Email -->
      <div class="training-msg-tabs">
        <button
          type="button"
          class="btn sm"
          :class="{ primary: tab === 'team', 'training-nav-correct': ready && task.target === 'team' }"
          @click="tab = 'team'"
        >
          Team
        </button>
        <button
          type="button"
          class="btn sm"
          :class="{ primary: tab === 'email', 'training-nav-correct': ready && task.target === 'email' }"
          @click="tab = 'email'"
        >
          Email
        </button>
      </div>

      <div class="training-ui-chrome-body">
        <!-- Read an incoming customer thread -->
        <template v-if="task.kind === 'pick' && task.target?.startsWith('thread-')">
          <button
            v-for="t in threads"
            :key="t.id"
            type="button"
            class="training-msg-row"
            :class="{ on: picked === t.id, 'training-nav-correct': ready && t.id === task.target }"
            @click="picked = t.id"
          >
            <span>
              <b>{{ t.who }}</b>
              <small>{{ t.subject }}</small>
            </span>
            <span v-if="t.unread" class="pill blue">Unread</span>
          </button>
        </template>

        <!-- Choose who to email -->
        <template v-else-if="task.kind === 'pick'">
          <button
            v-for="c in customers"
            :key="c.id"
            type="button"
            class="training-msg-row"
            :class="{ on: picked === c.id, 'training-nav-correct': ready && c.id === task.target }"
            @click="picked = c.id"
          >
            <span>
              <b>{{ c.name }}</b>
              <small>{{ c.email }}</small>
            </span>
          </button>
        </template>

        <!-- Write the message -->
        <template v-else-if="task.kind === 'compose'">
          <label class="fld">
            Subject
            <input v-model="subject" type="text" placeholder="Invoice INV-000318 — labor hours">
          </label>
          <label class="fld">
            Message
            <textarea v-model="body" rows="3" placeholder="Hi — here is the breakdown you asked for…" />
          </label>
        </template>

        <!-- Buttons the real screen offers -->
        <template v-else>
          <div v-if="task.target === 'attach'" class="training-msg-context">
            <b>INV-000318</b>
            <small>Acme Fleet Services · Truck #HL-114</small>
          </div>
          <div class="training-msg-actions">
            <button
              v-if="task.target === 'attach'"
              type="button"
              class="btn sm"
              :class="{ 'training-nav-correct': ready }"
              @click="clicked = 'attach'"
            >
              Attach record
            </button>
            <button
              v-if="task.target === 'reply'"
              type="button"
              class="btn sm"
              :class="{ 'training-nav-correct': ready }"
              @click="clicked = 'reply'"
            >
              Reply
            </button>
            <button
              v-if="task.target === 'reply'"
              type="button"
              class="btn sm"
              @click="clicked = 'new'"
            >
              New email
            </button>
            <button
              v-if="task.target === 'send'"
              type="button"
              class="btn primary sm"
              :class="{ 'training-nav-correct': ready }"
              @click="clicked = 'send'"
            >
              Send
            </button>
            <button
              v-if="task.target === 'send'"
              type="button"
              class="btn sm"
              @click="clicked = 'discard'"
            >
              Discard
            </button>
          </div>
        </template>

        <p v-if="ready" class="training-ui-hint">{{ task.done }}</p>
        <p v-else-if="wrong" class="help" style="margin:0;color:#dc2626;">
          Not that one — try again.
        </p>
        <p v-else class="training-ui-hint muted">{{ task.ask }}</p>
      </div>
    </div>
  </div>

  <p v-else class="help">Unknown practice step.</p>
</template>
