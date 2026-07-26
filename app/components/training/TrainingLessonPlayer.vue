<script setup lang="ts">
import type { TrainingLessonStep } from '#shared/training-catalog'
import TrainingIcon from './TrainingIcon.vue'
import TrainingUiPreview from './TrainingUiPreview.vue'
import TrainingPracticePanel from './practice/TrainingPracticePanel.vue'
import {
  cancelTrainingSpeech,
  speakTrainingStep,
  stripTrainingMarkdown,
  unlockTrainingSpeech,
} from '~/utils/training-speech'

const props = defineProps<{
  moduleTitle: string
  lessonTitle: string
  steps: TrainingLessonStep[]
  initialStep?: number
  busy?: boolean
}>()

const emit = defineEmits<{
  stepChange: [index: number]
  complete: []
}>()

const stepIndex = ref(props.initialStep ?? 0)
const quizAnswer = ref<number | null>(null)
const quizSubmitted = ref(false)
const practiceReady = ref(false)

const current = computed(() => props.steps[stepIndex.value])
const isFirst = computed(() => stepIndex.value <= 0)
const isLast = computed(() => stepIndex.value >= props.steps.length - 1)

function narrateStep() {
  nextTick(() => speakTrainingStep(current.value, true))
}

watch(stepIndex, (idx) => {
  quizAnswer.value = null
  quizSubmitted.value = false
  practiceReady.value = false
  emit('stepChange', idx)
  narrateStep()
})

function onPracticeReady(ready: boolean) {
  practiceReady.value = ready
}

onMounted(() => {
  narrateStep()
})

onBeforeUnmount(() => {
  cancelTrainingSpeech()
})

function next() {
  unlockTrainingSpeech({ silent: true })
  if (current.value?.type === 'quiz' && !quizSubmitted.value) return
  if (current.value?.type === 'practice' && !practiceReady.value) return
  if (isLast.value) {
    cancelTrainingSpeech()
    emit('complete')
    return
  }
  stepIndex.value += 1
}

function back() {
  unlockTrainingSpeech({ silent: true })
  if (!isFirst.value) stepIndex.value -= 1
}

function submitQuiz() {
  if (quizAnswer.value == null) return
  quizSubmitted.value = true
  if (current.value?.explanation) {
    speakTrainingStep({ ...current.value, body: current.value.explanation, type: 'content' }, true)
  }
}

function quizOptionClass(i: number): string {
  if (!quizSubmitted.value) {
    return quizAnswer.value === i ? 'training-quiz-opt selected' : 'training-quiz-opt'
  }
  const correct = current.value?.correctIndex === i
  if (correct) return 'training-quiz-opt correct'
  if (quizAnswer.value === i) return 'training-quiz-opt wrong'
  return 'training-quiz-opt'
}

function formatBody(text: string): string {
  return stripTrainingMarkdown(text)
}
</script>

<template>
  <div class="training-player">
    <div class="training-player-top">
      <p class="help" style="margin:0 0 4px;">{{ moduleTitle }}</p>
      <h2>{{ lessonTitle }}</h2>
      <div class="training-step-bar">
        <span
          v-for="(_, i) in steps"
          :key="i"
          class="training-step-dot"
          :class="{ done: i < stepIndex, active: i === stepIndex }"
        />
      </div>
    </div>

    <div v-if="current" class="training-player-body">
      <template v-if="current.type === 'welcome' || current.type === 'complete'">
        <div class="training-card-icon" style="width:56px;height:56px;">
          <TrainingIcon :name="current.type === 'complete' ? 'check' : (current.icon || 'book')" :size="28" />
        </div>
        <h3 class="training-step-title">{{ current.title }}</h3>
        <p v-if="current.subtitle" class="training-step-sub">{{ current.subtitle }}</p>
        <p class="training-step-body">{{ formatBody(current.body ?? '') }}</p>
      </template>

      <template v-else-if="current.type === 'content'">
        <h3 class="training-step-title">{{ current.title }}</h3>
        <p class="training-step-body">{{ formatBody(current.body ?? '') }}</p>
        <ul v-if="current.tips?.length" class="training-tips">
          <li v-for="(tip, i) in current.tips" :key="i">{{ tip }}</li>
        </ul>
      </template>

      <template v-else-if="current.type === 'practice'">
        <h3 class="training-step-title">{{ current.title }}</h3>
        <p v-if="current.body" class="training-step-body">{{ formatBody(current.body) }}</p>
        <ul v-if="current.tips?.length" class="training-tips">
          <li v-for="(tip, i) in current.tips" :key="i">{{ tip }}</li>
        </ul>
        <TrainingPracticePanel
          v-if="current.practiceId"
          :practice-id="current.practiceId"
          @ready="onPracticeReady"
        />
      </template>

      <template v-else-if="current.type === 'interactive'">
        <h3 class="training-step-title">{{ current.title }}</h3>
        <p class="training-step-body">{{ formatBody(current.body ?? '') }}</p>
        <TrainingUiPreview v-if="current.demo" :preview="current.demo" />
        <div v-if="current.callouts?.length" class="training-callouts">
          <p v-for="(c, i) in current.callouts" :key="i" class="training-callout">
            <span><b>{{ c.label }}</b><template v-if="c.detail"> — {{ c.detail }}</template></span>
          </p>
        </div>
      </template>

      <!-- Role-by-role pipeline (the workflow course) -->
      <template v-else-if="current.type === 'flow'">
        <h3 class="training-step-title">{{ current.title }}</h3>
        <p v-if="current.body" class="training-step-body">{{ formatBody(current.body) }}</p>
        <div class="training-flow">
          <div v-for="(s, i) in current.stages ?? []" :key="i" class="training-flow-stage">
            <div class="training-flow-rail"><i /><span /></div>
            <div class="training-flow-copy">
              <span class="training-flow-role">{{ s.role }}</span>
              <p class="training-flow-action">{{ s.action }}</p>
              <p class="training-flow-result">{{ s.result }}</p>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="current.type === 'quiz'">
        <h3 class="training-step-title">{{ current.title }}</h3>
        <p class="training-step-body" style="font-weight:600;color:#0f172a;">{{ current.question }}</p>
        <div class="training-quiz-options">
          <button
            v-for="(opt, i) in current.options ?? []"
            :key="i"
            type="button"
            :class="quizOptionClass(i)"
            :disabled="quizSubmitted"
            @click="quizAnswer = i"
          >
            {{ opt }}
          </button>
        </div>
        <p v-if="quizSubmitted && current.explanation" class="help" style="margin:0;">
          {{ current.explanation }}
        </p>
        <button
          v-if="!quizSubmitted"
          type="button"
          class="btn primary sm"
          :disabled="quizAnswer == null"
          @click="submitQuiz"
        >
          Check answer
        </button>
      </template>

      <template v-else-if="current.type === 'checklist'">
        <h3 class="training-step-title">{{ current.title }}</h3>
        <div class="training-checklist">
          <div v-for="(item, i) in current.items ?? []" :key="i" class="training-check-item">
            <span class="training-check-mark">✓</span>
            <div>
              <b>{{ item.label }}</b>
              <span v-if="item.detail">{{ item.detail }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="training-player-foot">
      <button type="button" class="btn" :disabled="isFirst || busy" @click="back">
        Back
      </button>
      <button
        type="button"
        class="btn primary"
        :disabled="busy || (current?.type === 'quiz' && !quizSubmitted) || (current?.type === 'practice' && !practiceReady)"
        @click="next"
      >
        {{ isLast ? 'Finish lesson' : 'Continue' }}
      </button>
    </div>
  </div>
</template>
