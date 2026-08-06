<script setup lang="ts">
import type { SheetGridRow } from '#shared/service-log-sheet-layout'
import type { ServiceLogSheetEditor } from '~/composables/useServiceLogSheetEditor'

/**
 * One full catalog <tr>. Kept as a row component (not a cell component) so Vue
 * never mounts a custom element inside <tr> — that pattern drops all cells in
 * WebKit and left the Paper view looking like an empty gray stage.
 */
const props = defineProps<{
  api: ServiceLogSheetEditor
  row: SheetGridRow
}>()

const emit = defineEmits<{ catalog: [sectionId: string] }>()

const leftTitle = computed(() => {
  const cell = props.row.left
  return cell?.kind === 'title' ? props.api.findSection(cell.sectionId) : undefined
})
const rightTitle = computed(() => {
  const cell = props.row.right
  return cell?.kind === 'title' ? props.api.findSection(cell.sectionId) : undefined
})
const leftLine = computed(() => {
  const cell = props.row.left
  if (cell?.kind !== 'item') return undefined
  return props.api.findSection(cell.sectionId)?.items.find(item => item.id === cell.item.id)
})
const rightLine = computed(() => {
  const cell = props.row.right
  if (cell?.kind !== 'item') return undefined
  return props.api.findSection(cell.sectionId)?.items.find(item => item.id === cell.item.id)
})

const leftEndClass = computed(() => (props.row.leftEnd ? 'group-end' : ''))
const rightEndClass = computed(() => (props.row.rightEnd ? 'group-end' : ''))

const leftSectionSelected = computed(() =>
  Boolean(props.row.left && props.api.selectedSectionId === props.row.left.sectionId),
)
const rightSectionSelected = computed(() =>
  Boolean(props.row.right && props.api.selectedSectionId === props.row.right.sectionId),
)
const leftItemSelected = computed(() =>
  Boolean(leftLine.value && props.api.selectedItemId === leftLine.value.id),
)
const rightItemSelected = computed(() =>
  Boolean(rightLine.value && props.api.selectedItemId === rightLine.value.id),
)
</script>

<template>
  <tr>
    <template v-if="!row.left">
      <td class="void-cell" />
      <td class="void-cell" />
      <td class="void-cell" />
      <td class="void-cell" />
    </template>
    <td
      v-else-if="row.left.kind === 'title' && leftTitle"
      colspan="4"
      class="category-title"
      :class="{ 'is-selected': leftSectionSelected }"
      @click="api.selectSection(leftTitle.id)"
    >
      <span class="sl-title-line">
        <input
          v-model="leftTitle.title"
          class="sheet-input sl-title-input"
          type="text"
          maxlength="120"
          aria-label="Section title"
        >
        <span class="sl-tools">
          <button type="button" class="sl-tool" title="Move section up" @click.stop="api.moveSection(leftTitle.id, -1)">↑</button>
          <button type="button" class="sl-tool" title="Move section down" @click.stop="api.moveSection(leftTitle.id, 1)">↓</button>
          <button type="button" class="sl-tool" title="Move to right column" @click.stop="api.moveSectionColumn(leftTitle.id)">→</button>
          <button type="button" class="sl-tool" title="Add line" @click.stop="api.addItem(leftTitle.id)">+</button>
          <button type="button" class="sl-tool" title="Add from catalog" @click.stop="emit('catalog', leftTitle.id)">☰</button>
          <button type="button" class="sl-tool is-danger" title="Remove section" @click.stop="api.removeSection(leftTitle.id)">✕</button>
        </span>
      </span>
    </td>
    <template v-else-if="row.left.kind === 'item' && leftLine">
      <td class="check-cell" :class="leftEndClass"><span class="checkbox" /></td>
      <td
        class="service-name"
        :class="[leftEndClass, { 'is-selected': leftItemSelected }]"
        @click="api.selectItem(row.left.sectionId, leftLine.id)"
      >
        <input v-model="leftLine.name" class="sheet-input" type="text" maxlength="200" aria-label="Service name">
        <span v-if="leftLine.subtext || leftItemSelected" class="service-subtext">
          <input v-model="leftLine.subtext" class="sheet-input" type="text" maxlength="200" placeholder="Note" aria-label="Service note">
        </span>
        <span class="sl-tools sl-tools-row">
          <button type="button" class="sl-tool" title="Move line up" @click.stop="api.moveItem(row.left.sectionId, leftLine.id, -1)">↑</button>
          <button type="button" class="sl-tool" title="Move line down" @click.stop="api.moveItem(row.left.sectionId, leftLine.id, 1)">↓</button>
          <button type="button" class="sl-tool is-danger" title="Remove line" @click.stop="api.removeItem(row.left.sectionId, leftLine.id)">✕</button>
        </span>
      </td>
      <td class="price-cell" :class="[leftEndClass, { 'is-selected': leftItemSelected }]">
        <input v-model="leftLine.price" class="sheet-input sl-price-input" type="text" maxlength="40" aria-label="Printed price">
      </td>
      <td class="new-price-cell" :class="leftEndClass">&nbsp;</td>
    </template>
    <template v-else>
      <td class="void-cell" />
      <td class="void-cell" />
      <td class="void-cell" />
      <td class="void-cell" />
    </template>

    <td class="grid-gap" />

    <template v-if="!row.right">
      <td class="void-cell" />
      <td class="void-cell" />
      <td class="void-cell" />
      <td class="void-cell" />
    </template>
    <td
      v-else-if="row.right.kind === 'title' && rightTitle"
      colspan="4"
      class="category-title"
      :class="{ 'is-selected': rightSectionSelected }"
      @click="api.selectSection(rightTitle.id)"
    >
      <span class="sl-title-line">
        <input
          v-model="rightTitle.title"
          class="sheet-input sl-title-input"
          type="text"
          maxlength="120"
          aria-label="Section title"
        >
        <span class="sl-tools">
          <button type="button" class="sl-tool" title="Move section up" @click.stop="api.moveSection(rightTitle.id, -1)">↑</button>
          <button type="button" class="sl-tool" title="Move section down" @click.stop="api.moveSection(rightTitle.id, 1)">↓</button>
          <button type="button" class="sl-tool" title="Move to left column" @click.stop="api.moveSectionColumn(rightTitle.id)">←</button>
          <button type="button" class="sl-tool" title="Add line" @click.stop="api.addItem(rightTitle.id)">+</button>
          <button type="button" class="sl-tool" title="Add from catalog" @click.stop="emit('catalog', rightTitle.id)">☰</button>
          <button type="button" class="sl-tool is-danger" title="Remove section" @click.stop="api.removeSection(rightTitle.id)">✕</button>
        </span>
      </span>
    </td>
    <template v-else-if="row.right.kind === 'item' && rightLine">
      <td class="check-cell" :class="rightEndClass"><span class="checkbox" /></td>
      <td
        class="service-name"
        :class="[rightEndClass, { 'is-selected': rightItemSelected }]"
        @click="api.selectItem(row.right.sectionId, rightLine.id)"
      >
        <input v-model="rightLine.name" class="sheet-input" type="text" maxlength="200" aria-label="Service name">
        <span v-if="rightLine.subtext || rightItemSelected" class="service-subtext">
          <input v-model="rightLine.subtext" class="sheet-input" type="text" maxlength="200" placeholder="Note" aria-label="Service note">
        </span>
        <span class="sl-tools sl-tools-row">
          <button type="button" class="sl-tool" title="Move line up" @click.stop="api.moveItem(row.right.sectionId, rightLine.id, -1)">↑</button>
          <button type="button" class="sl-tool" title="Move line down" @click.stop="api.moveItem(row.right.sectionId, rightLine.id, 1)">↓</button>
          <button type="button" class="sl-tool is-danger" title="Remove line" @click.stop="api.removeItem(row.right.sectionId, rightLine.id)">✕</button>
        </span>
      </td>
      <td class="price-cell" :class="[rightEndClass, { 'is-selected': rightItemSelected }]">
        <input v-model="rightLine.price" class="sheet-input sl-price-input" type="text" maxlength="40" aria-label="Printed price">
      </td>
      <td class="new-price-cell" :class="rightEndClass">&nbsp;</td>
    </template>
    <template v-else>
      <td class="void-cell" />
      <td class="void-cell" />
      <td class="void-cell" />
      <td class="void-cell" />
    </template>
  </tr>
</template>
