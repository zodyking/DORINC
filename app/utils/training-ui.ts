import { trainingCategoryLabel } from '#shared/training-catalog'

export interface TrainingGate {
  locked: boolean
  assignmentId: string | null
  moduleId: string | null
  moduleSlug: string | null
  moduleTitle: string | null
}

export const TRAINING_STATUS_LABELS: Record<string, string> = {
  assigned: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
}

export const TRAINING_STATUS_PILLS: Record<string, string> = {
  assigned: 'pill amber',
  in_progress: 'pill blue',
  completed: 'pill green',
}

/** Icon names rendered by TrainingIcon.vue. */
export const TRAINING_MODULE_ICONS = [
  'workflow', 'compass', 'mic', 'camera', 'clipboard',
  'invoice', 'users', 'portal', 'message', 'shield', 'book',
] as const

export function trainingModuleIcon(icon: string): string {
  return (TRAINING_MODULE_ICONS as readonly string[]).includes(icon) ? icon : 'book'
}

export function trainingCategory(category: string): string {
  return trainingCategoryLabel(category)
}

export function trainingProgressLabel(percent: number): string {
  if (percent >= 100) return 'Complete'
  if (percent <= 0) return 'Not started'
  return `${percent}% complete`
}

export function isTrainingPath(path: string): boolean {
  return path === '/training' || path.startsWith('/training/learn/')
}

/** Active lesson player — used by the training lock (hub does not count). */
export function isTrainingLearnPath(path: string): boolean {
  return path.startsWith('/training/learn/')
}
