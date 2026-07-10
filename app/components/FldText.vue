<script setup lang="ts">
import type { ProseFieldMode } from '#shared/format/prose-field'
import { useProseField } from '~/composables/useProseField'

const model = defineModel<string>({ default: '' })

const props = withDefaults(defineProps<{
  label?: string
  mode?: ProseFieldMode
  type?: string
  placeholder?: string
  required?: boolean
  rows?: number
  multiline?: boolean
  bare?: boolean
}>(), {
  mode: 'prose',
  type: 'text',
  rows: 4,
  multiline: false,
  bare: false,
})

const inputRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const { inputAttrs, onInput, onFocus, onBlur } = useProseField(model, toRef(props, 'mode'))
</script>

<template>
  <label v-if="!bare && label" class="fld">
    {{ label }}
    <input
      v-if="!multiline"
      ref="inputRef"
      v-bind="inputAttrs"
      :value="model"
      :type="type"
      :placeholder="placeholder"
      :required="required"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    >
    <textarea
      v-else
      ref="inputRef"
      v-bind="inputAttrs"
      :value="model"
      :rows="rows"
      :placeholder="placeholder"
      :required="required"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
  </label>
  <template v-else>
    <input
      v-if="!multiline"
      ref="inputRef"
      v-bind="inputAttrs"
      :value="model"
      :type="type"
      :placeholder="placeholder"
      :required="required"
      class="fld-input-bare"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    >
    <textarea
      v-else
      ref="inputRef"
      v-bind="inputAttrs"
      :value="model"
      :rows="rows"
      :placeholder="placeholder"
      :required="required"
      class="fld-input-bare"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
  </template>
</template>

<style scoped>
.fld-input-bare {
  display: block;
  width: 100%;
  margin-top: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  background: #fff;
  font: inherit;
  font-size: 16px;
  color: #0f172a;
  padding: 9px 12px;
}
</style>
