import type { TrainingLessonStep } from '#shared/training-catalog'
import { trainingStepNarration, stripTrainingMarkdown } from '#shared/training-speech'
import {
  armWizardSpeechFromCreateClick,
  cancelSpeech,
  speakWizardText,
  unlockSpeechFromUserGesture,
} from '~/utils/wizard-speech'

export { stripTrainingMarkdown, trainingStepNarration }

/** Arm speech from a course Start / Continue click (same as invoice & service-log wizards). */
export function armTrainingSpeechFromClick(): void {
  armWizardSpeechFromCreateClick()
}

export { unlockSpeechFromUserGesture as unlockTrainingSpeech, cancelSpeech as cancelTrainingSpeech }

export function speakTrainingStep(step: TrainingLessonStep | undefined, fromGesture = true): void {
  if (!step) return
  const text = trainingStepNarration(step)
  if (!text) return
  speakWizardText(text, { fromGesture, skipConsentCheck: true })
}
