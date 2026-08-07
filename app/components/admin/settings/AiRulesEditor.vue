<script setup lang="ts">
import type { AiRuleCard } from '#shared/ai-rules'
import {
  createAiRuleCard,
  parseAiRuleCards,
  serializeAiRuleCards,
} from '#shared/ai-rules'

const props = defineProps<{
  modelValue: string
  fallbackCards: AiRuleCard[]
  title?: string
  help?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const cards = ref<AiRuleCard[]>([])
const editingId = ref<string | null>(null)
const draft = reactive({ title: '', rule: '' })
const localError = ref('')

watch(() => props.modelValue, (value) => {
  cards.value = parseAiRuleCards(value, props.fallbackCards)
}, { immediate: true })

function persist(next: AiRuleCard[]) {
  cards.value = next
  emit('update:modelValue', serializeAiRuleCards(next))
}

function startEdit(card: AiRuleCard) {
  editingId.value = card.id
  draft.title = card.title
  draft.rule = card.rule
  localError.value = ''
}

function cancelEdit() {
  editingId.value = null
  draft.title = ''
  draft.rule = ''
  localError.value = ''
}

function saveEdit() {
  if (!editingId.value) return
  const title = draft.title.trim()
  const rule = draft.rule.trim()
  if (!rule) {
    localError.value = 'Rule text is required'
    return
  }
  persist(cards.value.map(card => (
    card.id === editingId.value
      ? createAiRuleCard({ id: card.id, title: title || 'Untitled rule', rule })
      : card
  )))
  cancelEdit()
}

function removeCard(id: string) {
  if (editingId.value === id) cancelEdit()
  persist(cards.value.filter(card => card.id !== id))
}

function addCard() {
  const card = createAiRuleCard({ title: `Rule ${cards.value.length + 1}`, rule: '' })
  persist([...cards.value, card])
  startEdit(card)
}

function restoreDefaults() {
  cancelEdit()
  persist(props.fallbackCards.map(card => ({ ...card })))
}
</script>

<template>
  <div class="ai-rules-editor">
    <div class="ai-rules-editor__head">
      <div>
        <h4 v-if="title">{{ title }}</h4>
        <p v-if="help" class="help">{{ help }}</p>
      </div>
      <div class="ai-rules-editor__head-actions">
        <button type="button" class="btn sm" @click="restoreDefaults">Restore defaults</button>
        <button type="button" class="btn sm primary" @click="addCard">Add rule</button>
      </div>
    </div>

    <p v-if="localError" class="settings-err">{{ localError }}</p>

    <div class="ai-rules-editor__list">
      <article
        v-for="(card, index) in cards"
        :key="card.id"
        class="ai-rule-card"
        :class="{ editing: editingId === card.id }"
      >
        <header class="ai-rule-card__head">
          <span class="ai-rule-card__index">{{ index + 1 }}</span>
          <div class="ai-rule-card__titles">
            <strong>{{ card.title }}</strong>
            <p v-if="editingId !== card.id">{{ card.rule || 'Empty rule — edit to add text.' }}</p>
          </div>
          <div class="ai-rule-card__actions">
            <button
              v-if="editingId !== card.id"
              type="button"
              class="btn sm"
              @click="startEdit(card)"
            >
              Edit
            </button>
            <button
              type="button"
              class="btn sm"
              :disabled="editingId === card.id"
              @click="removeCard(card.id)"
            >
              Delete
            </button>
          </div>
        </header>

        <div v-if="editingId === card.id" class="ai-rule-card__edit">
          <label class="fld">
            Title
            <input v-model="draft.title" type="text" maxlength="120">
          </label>
          <label class="fld">
            Rule
            <textarea v-model="draft.rule" rows="4" maxlength="2000" />
          </label>
          <div class="ai-rule-card__edit-actions">
            <button type="button" class="btn sm" @click="cancelEdit">Cancel</button>
            <button type="button" class="btn sm primary" @click="saveEdit">Save rule</button>
          </div>
        </div>
      </article>
    </div>

    <p class="help" style="margin-top:10px;">
      Saved as one JSON rule list and sent to AI as a complete JSON string.
    </p>
  </div>
</template>

<style scoped>
.ai-rules-editor__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.ai-rules-editor__head h4 {
  margin: 0 0 4px;
  font-size: 15px;
}
.ai-rules-editor__head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ai-rules-editor__list {
  display: grid;
  gap: 10px;
}
.ai-rule-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  padding: 12px 14px;
}
.ai-rule-card.editing {
  border-color: #a5b4fc;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}
.ai-rule-card__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: start;
}
.ai-rule-card__index {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  font-weight: 800;
}
.ai-rule-card__titles strong {
  display: block;
  font-size: 14px;
}
.ai-rule-card__titles p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.4;
  white-space: pre-wrap;
}
.ai-rule-card__actions {
  display: flex;
  gap: 6px;
}
.ai-rule-card__edit {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}
.ai-rule-card__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 720px) {
  .ai-rules-editor__head { flex-direction: column; }
  .ai-rule-card__head { grid-template-columns: auto 1fr; }
  .ai-rule-card__actions { grid-column: 1 / -1; }
}
</style>
