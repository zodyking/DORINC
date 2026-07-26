import { isTrainingLearnPath } from './training-ui'

/** Redirect staff to their locked training lesson when access is gated. */
export async function redirectTrainingGateIfLocked(): Promise<void> {
  const auth = useAuthStore()
  if (!auth.loaded) await auth.fetchMe()

  if (!auth.trainingGate?.locked) return
  if (isTrainingLearnPath(useRoute().path)) return

  const slug = auth.trainingGate.moduleSlug
  if (slug) {
    await navigateTo(`/training/learn/${slug}`)
  }
}
