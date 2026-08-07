/**
 * Card-based AI rule lists stored/sent as one JSON string.
 * Shape: [{ "id": "...", "title": "...", "rule": "..." }, ...]
 */

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function createAiRuleCard(partial = {}) {
  return {
    id: partial.id || newId(),
    title: String(partial.title ?? '').trim() || 'Untitled rule',
    rule: String(partial.rule ?? '').trim(),
  }
}

/** Parse stored rules — supports JSON array of cards, JSON string array, or newline text. */
export function parseAiRuleCards(raw, fallback = []) {
  const text = String(raw ?? '').trim()
  if (!text) return fallback.map(r => ({ ...r }))

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      const cards = parsed
        .map((item, index) => {
          if (typeof item === 'string') {
            const rule = item.trim()
            if (!rule) return null
            return createAiRuleCard({ title: `Rule ${index + 1}`, rule })
          }
          if (item && typeof item === 'object') {
            const rule = String(item.rule ?? item.text ?? item.description ?? '').trim()
            if (!rule) return null
            return createAiRuleCard({
              id: typeof item.id === 'string' ? item.id : undefined,
              title: String(item.title ?? item.label ?? item.name ?? `Rule ${index + 1}`),
              rule,
            })
          }
          return null
        })
        .filter(Boolean)
      if (cards.length) return cards
    }
  }
  catch {
    // fall through
  }

  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return fallback.map(r => ({ ...r }))
  return lines.map((rule, index) => createAiRuleCard({ title: `Rule ${index + 1}`, rule }))
}

export function serializeAiRuleCards(cards) {
  const cleaned = (cards || [])
    .map(card => createAiRuleCard(card))
    .filter(card => card.rule.length > 0)
  return JSON.stringify(cleaned, null, 2)
}

export function formatAiRulesForPrompt(raw, fallback = []) {
  const cards = parseAiRuleCards(raw, fallback)
  return cards
    .map((card, i) => `${i + 1}. ${card.title}: ${card.rule}`)
    .join('\n')
}
