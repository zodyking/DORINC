/**
 * Product AI assistant identity — use everywhere staff/customers see the assistant.
 * Provider names (OpenRouter) stay technical; the assistant’s name is Susan.
 */
export const AI_ASSISTANT_NAME = 'Susan' as const

/** Full label for email sections, cards, and formal callouts. */
export const AI_ASSISTANT_TITLE = 'Susan AI Assistant' as const

/** Display name when Susan acts as AI Administrator (deletion reviews, etc.). */
export const AI_ADMINISTRATOR_DISPLAY_NAME = 'Susan AI Administrator' as const

/** Stable system email for the Susan AI Administrator account (not a human login). */
export const SUSAN_SYSTEM_EMAIL = 'susan.ai@dorinc.system' as const

export const AI_ASSISTANT_SHORT_LABEL = AI_ASSISTANT_NAME

/** True when the email belongs to the locked Susan system account. */
export function isSusanSystemEmail(email: string | null | undefined): boolean {
  return String(email ?? '').trim().toLowerCase() === SUSAN_SYSTEM_EMAIL
}

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
