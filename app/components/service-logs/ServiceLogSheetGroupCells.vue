<script setup lang="ts">
import type { SheetColumnRow } from '#shared/service-log-sheet-layout'
import type { ServiceLogSheetEditor } from '~/composables/useServiceLogSheetEditor'

/**
 * The four catalog cells of one column group, rendered exactly like the printed
 * sheet (check | service | price | new) with inline inputs on top.
 */
const props = defineProps<{
  api: ServiceLogSheetEditor
  row: SheetColumnRow | null
  groupEnd: boolean
  column: 'left' | 'right'
}>()

const emit = defineEmits<{ catalog: [sectionId: string] }>()

const endClass = computed(() => (props.groupEnd ? 'group-end' : ''))

const titleSection = computed(() => {
  const row = props.row
  return row?.kind === 'title' ? props.api.findSection(row.sectionId) : undefined
})

/** Resolve the live document line so edits never mutate the row prop. */
const line = computed(() => {
  const row = props.row
  if (row?.kind !== 'item') return undefined
  return props.api.findSection(row.sectionId)?.items.find(item => item.id === row.item.id)
})

const isSelectedSection = computed(() =>
  props.row ? props.api.selectedSectionId === props.row.sectionId : false,
)
const isSelectedItem = computed(() =>
  line.value ? props.api.selectedItemId === line.value.id : false,
)
</script>

<template>
  <template v-if="!row">
    <td class="void-cell" />
    <td class="void-cell" />
    <td class="void-cell" />
    <td class="void-cell" />
  </template>

  <td
    v-else-if="row.kind === 'title' && titleSection"
    colspan="4"
    class="category-title"
    :class="{ 'is-selected': isSelectedSection }"
    @click="api.selectSection(titleSection.id)"
  >
    <span class="sl-title-line">
      <input
        v-model="titleSection.title"
        class="sheet-input sl-title-input"
        type="text"
        maxlength="120"
        aria-label="Section title"
      >
      <span class="sl-tools">
        <button
          type="button"
          class="sl-tool"
          title="Move section up"
          @click.stop="api.moveSection(titleSection.id, -1)"
        >↑</button>
        <button
          type="button"
          class="sl-tool"
          title="Move section down"
          @click.stop="api.moveSection(titleSection.id, 1)"
        >↓</button>
        <button
          type="button"
          class="sl-tool"
          :title="column === 'left' ? 'Move to right column' : 'Move to left column'"
          @click.stop="api.moveSectionColumn(titleSection.id)"
        >{{ column === 'left' ? '→' : '←' }}</button>
        <button
          type="button"
          class="sl-tool"
          title="Add line"
          @click.stop="api.addItem(titleSection.id)"
        >+</button>
        <button
          type="button"
          class="sl-tool"
          title="Add from catalog"
          @click.stop="emit('catalog', titleSection.id)"
        >☰</button>
        <button
          type="button"
          class="sl-tool is-danger"
          title="Remove section"
          @click.stop="api.removeSection(titleSection.id)"
        >✕</button>
      </span>
    </span>
  </td>

  <template v-else-if="row.kind === 'item' && line">
    <td class="check-cell" :class="endClass">
      <span class="checkbox" />
    </td>
    <td
      class="service-name"
      :class="[endClass, { 'is-selected': isSelectedItem }]"
      @click="api.selectItem(row.sectionId, line.id)"
    >
      <input
        v-model="line.name"
        class="sheet-input"
        type="text"
        maxlength="200"
        aria-label="Service name"
      >
      <span v-if="line.subtext || isSelectedItem" class="service-subtext">
        <input
          v-model="line.subtext"
          class="sheet-input"
          type="text"
          maxlength="200"
          placeholder="Note"
          aria-label="Service note"
        >
      </span>
      <span class="sl-tools sl-tools-row">
        <button
          type="button"
          class="sl-tool"
          title="Move line up"
          @click.stop="api.moveItem(row.sectionId, line.id, -1)"
        >↑</button>
        <button
          type="button"
          class="sl-tool"
          title="Move line down"
          @click.stop="api.moveItem(row.sectionId, line.id, 1)"
        >↓</button>
        <button
          type="button"
          class="sl-tool is-danger"
          title="Remove line"
          @click.stop="api.removeItem(row.sectionId, line.id)"
        >✕</button>
      </span>
    </td>
    <td class="price-cell" :class="[endClass, { 'is-selected': isSelectedItem }]">
      <input
        v-model="line.price"
        class="sheet-input sl-price-input"
        type="text"
        maxlength="40"
        aria-label="Printed price"
      >
    </td>
    <td class="new-price-cell" :class="endClass">&nbsp;</td>
  </template>
</template>
