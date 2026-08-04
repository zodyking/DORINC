<script setup lang="ts">
import type { AiSuggestionRow } from '~/utils/ai-ui'
import {
  lineAuditIssueLines,
  parseLineAuditContent,
} from '~/utils/invoice-line-audit-ui'
import { moneyDisplay } from '~/utils/invoices-ui'

const props = defineProps<{
  open: boolean
  suggestion: AiSuggestionRow | null
  busy?: boolean
  requireReview?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [decisions: Array<{ lineItemId: string, action: 'accept' | 'reject' }>]
}>()

const content = computed(() =>
  props.suggestion ? parseLineAuditContent(props.suggestion) : null,
)

const issueLines = computed(() =>
  content.value ? lineAuditIssueLines(content.value) : [],
)

const decisions = ref<Record<string, 'accept' | 'reject'>>({})

watch(() => props.suggestion?.id, () => {
  const next: Record<string, 'accept' | 'reject'> = {}
  for (const line of issueLines.value) {
    next[line.lineItemId] = 'accept'
  }
  decisions.value = next
}, { immediate: true })

const isPending = computed(() => props.suggestion?.status === 'pending')

function setDecision(lineItemId: string, action: 'accept' | 'reject') {
  decisions.value = { ...decisions.value, [lineItemId]: action }
}

function onSubmit() {
  if (!props.suggestion || !issueLines.value.length) {
    emit('close')
    return
  }
  emit('submit', issueLines.value.map(line => ({
    lineItemId: line.lineItemId,
    action: decisions.value[line.lineItemId] ?? 'reject',
  })))
}

function formatCheckedAt(value: string | undefined) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString()
  }
  catch {
    return value
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-scrim open invoice-audit-scrim"
      role="presentation"
      @click.self="!requireReview && emit('close')"
    >
      <div
        class="modal invoice-audit-modal"
        role="dialog"
        aria-label="Invoice line audit report"
        @click.stop
      >
        <div class="mh">
          <div>
            <b>✦ Line item audit</b>
            <p v-if="content" class="invoice-audit-meta">
              Checked {{ formatCheckedAt(content.checkedAt) }}
              · {{ content.summary.issuesFound }} issue{{ content.summary.issuesFound === 1 ? '' : 's' }}
              <span v-if="suggestion && !isPending"> · {{ suggestion.status }}</span>
            </p>
          </div>
          <button
            v-if="!requireReview"
            type="button"
            class="btn sm"
            aria-label="Close audit report"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <div class="mb invoice-audit-body">
          <p v-if="!content" class="help">
            No audit report yet. Save the invoice to run a line-item check.
          </p>

          <p v-else-if="!issueLines.length" class="help">
            All {{ content.summary.totalLines }} line items passed the audit.
          </p>

          <div v-else class="invoice-audit-lines">
            <article
              v-for="(line, index) in issueLines"
              :key="line.lineItemId"
              class="invoice-audit-line"
            >
              <header>
                <b>Line {{ (line.sortOrder ?? index) + 1 }}</b>
                <span class="pill warn">Needs fix</span>
              </header>

              <ul v-if="line.issues.length" class="invoice-audit-issues">
                <li v-for="(issue, i) in line.issues" :key="i">{{ issue }}</li>
              </ul>

              <div class="invoice-audit-diff">
                <div>
                  <small>Before</small>
                  <p>{{ line.original.description }}</p>
                  <p class="invoice-audit-qty">
                    Qty {{ line.original.quantity }} · Rate {{ moneyDisplay(line.original.unitPrice) }}
                  </p>
                </div>
                <div v-if="line.suggested">
                  <small>Suggested</small>
                  <p>{{ line.suggested.description }}</p>
                  <p class="invoice-audit-qty">
                    Qty {{ line.suggested.quantity }} · Rate {{ moneyDisplay(line.suggested.unitPrice) }}
                  </p>
                </div>
              </div>

              <div v-if="isPending && requireReview" class="invoice-audit-actions">
                <button
                  type="button"
                  class="btn sm"
                  :class="{ primary: decisions[line.lineItemId] === 'accept' }"
                  @click="setDecision(line.lineItemId, 'accept')"
                >
                  Accept fix
                </button>
                <button
                  type="button"
                  class="btn sm"
                  :class="{ primary: decisions[line.lineItemId] === 'reject' }"
                  @click="setDecision(line.lineItemId, 'reject')"
                >
                  Keep original
                </button>
              </div>
            </article>
          </div>
        </div>

        <div class="mf">
          <template v-if="isPending && requireReview && issueLines.length">
            <button type="button" class="btn" :disabled="busy" @click="emit('close')">
              Cancel save
            </button>
            <button type="button" class="btn primary" :disabled="busy" @click="onSubmit">
              {{ busy ? 'Applying…' : 'Apply choices & continue save' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn primary" @click="emit('close')">Close</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.invoice-audit-scrim { z-index: 92; }
.invoice-audit-modal {
  max-width: min(720px, calc(100vw - 32px));
  width: 100%;
  max-height: min(88vh, 900px);
  display: flex;
  flex-direction: column;
}
.invoice-audit-modal .mh {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.invoice-audit-meta {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 400;
  color: #64748b;
}
.invoice-audit-body {
  overflow: auto;
  flex: 1;
}
.invoice-audit-lines {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.invoice-audit-line {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  background: #f8fafc;
}
.invoice-audit-line header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.invoice-audit-issues {
  margin: 0 0 10px 1.1rem;
  padding: 0;
  color: #b45309;
  font-size: 13px;
}
.invoice-audit-diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.invoice-audit-diff small {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #64748b;
  margin-bottom: 4px;
}
.invoice-audit-diff p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
.invoice-audit-qty {
  margin-top: 6px !important;
  color: #64748b;
  font-size: 12px !important;
}
.invoice-audit-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
@media (max-width: 640px) {
  .invoice-audit-diff { grid-template-columns: 1fr; }
}
</style>
