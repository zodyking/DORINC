import type { TrainingLessonStep } from './training-catalog'

/** Display helper — drop the bold markers, keep the words. */
export function stripTrainingMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1')
}

/**
 * Make a string safe to read aloud.
 *
 * Lesson copy uses typographic shorthand that screen speech mangles: arrows
 * ("Field work → invoice"), dashes and middot separators, ellipses and curly
 * quotes. Symbols become natural pauses or words so the narration sounds like a
 * sentence instead of spelling out punctuation. Display text keeps the symbols.
 */
export function narrationSafeText(text: string): string {
  return stripTrainingMarkdown(text)
    // Arrows and separators become a pause.
    .replace(/\s*(?:→|➔|⇒|⟶|->|=>)\s*/g, ', ')
    .replace(/\s*(?:↓|↑|←)\s*/g, ', ')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*·\s*/g, ', ')
    // Spoken words read better than the symbol name.
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+\/\s+/g, ' or ')
    // "#HL-114" should read as "number HL-114", not "hash".
    .replace(/#(?=\w)/g, 'number ')
    // Noise that speech engines announce or stumble over.
    .replace(/…/g, ' ')
    .replace(/[“”„]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[*_`#|]/g, ' ')
    // Tidy the result.
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/,\s*(?=[,.])/g, '')
    .replace(/^[,.\s]+/, '')
    .trim()
}

/** Join narration fragments into one spoken paragraph without doubled stops. */
function joinSpoken(parts: string[]): string {
  return parts
    .map(p => narrationSafeText(p))
    .filter(Boolean)
    .map(p => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(' ')
    .trim()
}

export function trainingStepNarration(step: TrainingLessonStep): string {
  const parts: string[] = []
  if (step.title) parts.push(step.title)
  if (step.subtitle) parts.push(step.subtitle)
  if (step.body) parts.push(step.body)
  if (step.question) parts.push(step.question)
  if (step.tips?.length) parts.push(...step.tips)

  // Read the pipeline out loud so audio matches what is on screen.
  if (step.stages?.length) {
    for (const stage of step.stages) {
      parts.push(`${stage.role}: ${stage.action} Result: ${stage.result}`)
    }
  }

  // Callouts point at the screen above — narrate label then detail.
  if (step.callouts?.length) {
    for (const c of step.callouts) {
      parts.push(c.detail ? `${c.label}: ${c.detail}` : c.label)
    }
  }

  if ((step.type === 'checklist' || step.type === 'do') && step.items?.length) {
    for (const item of step.items) {
      parts.push(item.detail ? `${item.label}: ${item.detail}` : item.label)
    }
  }

  return joinSpoken(parts)
}
