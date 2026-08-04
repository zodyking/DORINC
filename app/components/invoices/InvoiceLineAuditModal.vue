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

function lineTypeLabel(lineType: string) {
  if (lineType === 'part') return 'Part'
  if (lineType === 'fee') return 'Fee'
  return 'Labor'
}

function lineTotal(qty: string, rate: string) {
  const q = Number(qty)
  const r = Number(rate)
  if (!Number.isFinite(q) || !Number.isFinite(r)) return '—'
  return moneyDisplay(String(q * r))
}

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
      class="modal-scrim open audit-scrim"
      role="presentation"
      @click.self="!requireReview && emit('close')"
    >
      <div
        class="modal audit-modal"
        role="dialog"
        aria-label="Line item review"
        @click.stop
      >
        <header class="audit-head">
          <div>
            <h2>Review line corrections</h2>
            <p v-if="content" class="audit-sub">
              {{ content.summary.issuesFound }} line{{ content.summary.issuesFound === 1 ? '' : 's' }} need attention
              · {{ formatCheckedAt(content.checkedAt) }}
            </p>
          </div>
          <button
            v-if="!requireReview"
            type="button"
            class="btn sm audit-close"
            aria-label="Close"
            @click="emit('close')"
          >
            ✕
          </button>
        </header>

        <div class="audit-body">
          <p v-if="!content" class="audit-empty">
            No audit report yet. Save the invoice to run a line-item check.
          </p>

          <p v-else-if="!issueLines.length" class="audit-empty">
            All {{ content.summary.totalLines }} lines passed the check.
          </p>

          <div v-else class="audit-list">
            <section
              v-for="(line, index) in issueLines"
              :key="line.lineItemId"
              class="audit-card"
            >
              <div class="audit-card-top">
                <span class="audit-line-no">Line {{ (line.sortOrder ?? index) + 1 }}</span>
                <span class="audit-type">{{ lineTypeLabel(line.lineType) }}</span>
              </div>

              <div class="audit-compare">
                <article class="audit-col audit-col--original">
                  <h3>Original</h3>
                  <p class="audit-desc">{{ line.original.description }}</p>
                  <dl class="audit-meta">
                    <div><dt>Qty</dt><dd>{{ line.original.quantity }}</dd></div>
                    <div><dt>Rate</dt><dd>{{ moneyDisplay(line.original.unitPrice) }}</dd></div>
                    <div><dt>Total</dt><dd>{{ lineTotal(line.original.quantity, line.original.unitPrice) }}</dd></div>
                  </dl>
                </article>

                <div class="audit-arrow" aria-hidden="true">→</div>

                <article v-if="line.suggested" class="audit-col audit-col--corrected">
                  <h3>Corrected</h3>
                  <p class="audit-desc">{{ line.suggested.description }}</p>
                  <dl class="audit-meta">
                    <div><dt>Qty</dt><dd>{{ line.suggested.quantity }}</dd></div>
                    <div><dt>Rate</dt><dd>{{ moneyDisplay(line.suggested.unitPrice) }}</dd></div>
                    <div><dt>Total</dt><dd>{{ lineTotal(line.suggested.quantity, line.suggested.unitPrice) }}</dd></div>
                  </dl>
                </article>
              </div>

              <div v-if="line.issues.length" class="audit-reasons">
                <h4>Why change this line</h4>
                <ul>
                  <li v-for="(issue, i) in line.issues" :key="i">{{ issue }}</li>
                </ul>
              </div>

              <div v-if="isPending && requireReview" class="audit-choice">
                <button
                  type="button"
                  class="btn sm"
                  :class="{ primary: decisions[line.lineItemId] === 'accept' }"
                  @click="setDecision(line.lineItemId, 'accept')"
                >
                  Use correction
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
            </section>
          </div>
        </div>

        <footer class="audit-foot">
          <template v-if="isPending && requireReview && issueLines.length">
            <button type="button" class="btn" :disabled="busy" @click="emit('close')">
              Cancel save
            </button>
            <button type="button" class="btn primary" :disabled="busy" @click="onSubmit">
              {{ busy ? 'Applying…' : 'Apply & continue save' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn primary" @click="emit('close')">Close</button>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.audit-scrim { z-index: 92; }
.audit-modal {
  max-width: min(860px, calc(100vw - 28px));
  width: 100%;
  max-height: min(90vh, 920px);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.audit-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid #e2e8f0;
}
.audit-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}
.audit-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #64748b;
}
.audit-close {
  flex: none;
}
.audit-body {
  overflow: auto;
  flex: 1;
  padding: 16px 20px;
  background: #f8fafc;
}
.audit-empty {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
}
.audit-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.audit-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.audit-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.audit-line-no {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}
.audit-type {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #6366f1;
  background: #eef2ff;
  border-radius: 999px;
  padding: 2px 8px;
}
.audit-compare {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 10px;
  align-items: stretch;
}
.audit-col {
  border-radius: 10px;
  padding: 12px;
  min-width: 0;
}
.audit-col h3 {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
}
.audit-col--original {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.audit-col--corrected {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}
.audit-col--corrected h3 { color: #15803d; }
.audit-desc {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.45;
  color: #0f172a;
  word-break: break-word;
}
.audit-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.audit-meta div {
  min-width: 0;
}
.audit-meta dt {
  margin: 0 0 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #94a3b8;
}
.audit-meta dd {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.audit-arrow {
  display: grid;
  place-items: center;
  color: #94a3b8;
  font-size: 18px;
  padding-top: 28px;
}
.audit-reasons {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}
.audit-reasons h4 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}
.audit-reasons ul {
  margin: 0;
  padding: 0 0 0 1.15rem;
  color: #334155;
  font-size: 13px;
  line-height: 1.5;
}
.audit-reasons li + li {
  margin-top: 4px;
}
.audit-choice {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.audit-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}
@media (max-width: 720px) {
  .audit-compare {
    grid-template-columns: 1fr;
  }
  .audit-arrow {
    display: none;
  }
  .audit-meta {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
