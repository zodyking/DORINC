import type { TrainingGateState } from '~/stores/auth'

/** Where staff land after sign-in (training lock skips the dashboard). */
export function staffPostLoginPath(trainingGate: TrainingGateState | null | undefined): string {
  if (trainingGate?.locked && trainingGate.moduleSlug) {
    return `/training/learn/${trainingGate.moduleSlug}`
  }
  return '/dashboard'
}
