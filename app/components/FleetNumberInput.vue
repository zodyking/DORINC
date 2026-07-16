<script setup lang="ts">
import {
  FLEET_NUMBER_PLACEHOLDER,
  FLEET_NUMBER_REJECT_MESSAGE,
  fleetNumberHasRejectedPhrase,
} from '#shared/validators/fleet-number'

const model = defineModel<string>({ default: '' })
const { showAppAlert } = useAppAlert()

defineProps<{
  required?: boolean
  maxlength?: number | string
  autocomplete?: string
  inputClass?: string
}>()

function rejectInput(event: Event) {
  const input = event.target as HTMLInputElement
  model.value = ''
  input.value = ''
  showAppAlert(FLEET_NUMBER_REJECT_MESSAGE, 'Invalid fleet number')
}

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  const next = input.value
  if (fleetNumberHasRejectedPhrase(next)) {
    rejectInput(event)
    return
  }
  model.value = next
}
</script>

<template>
  <input
    :value="model"
    type="text"
    :required="required"
    :maxlength="maxlength"
    :autocomplete="autocomplete"
    :class="inputClass"
    :placeholder="FLEET_NUMBER_PLACEHOLDER"
    @input="onInput"
  >
</template>
