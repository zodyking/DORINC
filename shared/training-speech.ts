import type { TrainingLessonStep } from './training-catalog'

export function stripTrainingMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1')
}

export function trainingStepNarration(step: TrainingLessonStep): string {
  const parts: string[] = []
  if (step.title) parts.push(stripTrainingMarkdown(step.title))
  if (step.subtitle) parts.push(stripTrainingMarkdown(step.subtitle))
  if (step.body) parts.push(stripTrainingMarkdown(step.body))
  if (step.question) parts.push(stripTrainingMarkdown(step.question))
  if (step.tips?.length) parts.push(...step.tips.map(stripTrainingMarkdown))
  if (step.type === 'checklist' && step.items?.length) {
    for (const item of step.items) {
      parts.push(item.label)
      if (item.detail) parts.push(item.detail)
    }
  }
  return parts.filter(Boolean).join('. ')
}
