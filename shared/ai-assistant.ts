/**
 * Product AI assistant identity — use everywhere staff/customers see the assistant.
 * Provider names (OpenRouter) stay technical; the assistant’s name is Susan.
 */
export const AI_ASSISTANT_NAME = 'Susan' as const

/** Full label for email sections, cards, and formal callouts. */
export const AI_ASSISTANT_TITLE = 'Susan AI Assistant' as const

/** Display name when Susan acts as AI Administrator (deletion reviews, etc.). */
export const AI_ADMINISTRATOR_DISPLAY_NAME = 'Susan AI Administrator' as const

export const AI_ASSISTANT_SHORT_LABEL = AI_ASSISTANT_NAME

/** Greeting / intro copy for help chat and summaries. */
export function aiAssistantGreeting(firstName?: string | null): string {
  const first = String(firstName ?? '').trim().split(/\s+/).filter(Boolean)[0]
  const hi = first
    ? `Hi ${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}!`
    : 'Hi!'
  return `${hi} I'm ${AI_ASSISTANT_NAME}. Ask how to use DORINC, or attach a screenshot and I'll walk you through what I see.`
}

/** Footer / powered-by line when a model id is known. */
export function aiAssistantPoweredBy(modelLabel?: string | null): string {
  if (modelLabel?.trim()) return `${AI_ASSISTANT_NAME} · ${modelLabel.trim()}`
  return AI_ASSISTANT_NAME
}
