<script setup lang="ts">
import type { ServiceLogSheetSection } from '#shared/service-log-sheet-default'
import type { ServiceLogSheetEditor } from '~/composables/useServiceLogSheetEditor'

/**
 * Line editor for the service log sheet template.
 * Reads sections from the live document so the list cannot go blank when
 * derived column helpers are stale.
 */
const props = defineProps<{ api: ServiceLogSheetEditor }>()
const emit = defineEmits<{ catalog: [sectionId: string] }>()

const activeColumn = ref<'left' | 'right'>('left')

const columnSections = computed<ServiceLogSheetSection[]>(() => {
  const sections = props.api.doc?.sections ?? []
  return sections.filter(section => section.column === activeColumn.value)
})

function columnLines(column: 'left' | 'right'): number {
  const sections = props.api.doc?.sections ?? []
  return sections
    .filter(section => section.column === column)
    .reduce((total, section) => total + section.items.length, 0)
}
</script>

<template>
  <div class="sl-lines">
    <div class="sl-lines-tabs" role="tablist" aria-label="Sheet column">
      <button
        v-for="column in (['left', 'right'] as const)"
        :key="column"
        type="button"
        role="tab"
        class="sl-tab"
        :class="{ active: activeColumn === column }"
        :aria-selected="activeColumn === column"
        @click="activeColumn = column"
      >
        {{ column === 'left' ? 'Left column' : 'Right column' }}
        <span class="sl-tab-count">{{ columnLines(column) }}</span>
      </button>
    </div>

    <p class="sl-lines-help">
      Printed order, top to bottom. Both columns print side by side on the front page.
    </p>

    <div v-if="!columnSections.length" class="sl-lines-empty">
      <p>No sections in this column yet.</p>
      <button type="button" class="btn sm" @click="api.addSection(activeColumn)">
        + Add section
      </button>
    </div>

    <article
      v-for="(section, sectionIndex) in columnSections"
      :key="section.id"
      class="sl-card"
      :class="{ 'is-selected': api.selectedSectionId === section.id }"
    >
      <header class="sl-card-head">
        <label class="sl-field sl-field-grow">
          <span class="sl-field-label">Section title</span>
          <input
            v-model="section.title"
            type="text"
            maxlength="120"
            @focus="api.selectSection(section.id)"
          >
        </label>
        <div class="sl-card-tools">
          <button
            type="button"
            class="sl-btn"
            title="Move section up"
            :disabled="sectionIndex === 0"
            @click="api.moveSection(section.id, -1)"
          >↑</button>
          <button
            type="button"
            class="sl-btn"
            title="Move section down"
            :disabled="sectionIndex === columnSections.length - 1"
            @click="api.moveSection(section.id, 1)"
          >↓</button>
          <button
            type="button"
            class="sl-btn"
            :title="activeColumn === 'left' ? 'Move to right column' : 'Move to left column'"
            @click="api.moveSectionColumn(section.id)"
          >{{ activeColumn === 'left' ? '→' : '←' }}</button>
          <button
            type="button"
            class="sl-btn is-danger"
            title="Remove section"
            @click="api.removeSection(section.id)"
          >✕</button>
        </div>
      </header>

      <ul class="sl-items">
        <li v-for="(item, itemIndex) in section.items" :key="item.id" class="sl-item">
          <div class="sl-item-main">
            <label class="sl-field sl-field-grow">
              <span class="sl-field-label">Service</span>
              <input
                v-model="item.name"
                type="text"
                maxlength="200"
                @focus="api.selectItem(section.id, item.id)"
              >
            </label>
            <label class="sl-field sl-field-price">
              <span class="sl-field-label">Price</span>
              <input v-model="item.price" type="text" maxlength="40" inputmode="decimal">
            </label>
          </div>
          <div class="sl-item-main">
            <label class="sl-field sl-field-grow">
              <span class="sl-field-label">Note (optional)</span>
              <input v-model="item.subtext" type="text" maxlength="200" placeholder="e.g. 1995 to 2002">
            </label>
            <div class="sl-item-tools">
              <button
                type="button"
                class="sl-btn"
                title="Move line up"
                :disabled="itemIndex === 0"
                @click="api.moveItem(section.id, item.id, -1)"
              >↑</button>
              <button
                type="button"
                class="sl-btn"
                title="Move line down"
                :disabled="itemIndex === section.items.length - 1"
                @click="api.moveItem(section.id, item.id, 1)"
              >↓</button>
              <button
                type="button"
                class="sl-btn is-danger"
                title="Remove line"
                @click="api.removeItem(section.id, item.id)"
              >✕</button>
            </div>
          </div>
        </li>
      </ul>

      <footer class="sl-card-foot">
        <button type="button" class="btn sm" @click="api.addItem(section.id)">+ Add line</button>
        <button type="button" class="btn sm" @click="emit('catalog', section.id)">+ From catalog</button>
      </footer>
    </article>

    <button
      v-if="columnSections.length"
      type="button"
      class="btn sl-add-section"
      @click="api.addSection(activeColumn)"
    >
      + Add section to {{ activeColumn }} column
    </button>
  </div>
</template>

<style scoped>
.sl-lines {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}
.sl-lines-tabs {
  display: flex;
  gap: 6px;
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 6px;
  background: #eef2f7;
  border: 1px solid #dbe2ea;
  border-radius: 12px;
}
.sl-tab {
  flex: 1;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #475569;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.sl-tab.active {
  background: #fff;
  border-color: #cbd5e1;
  color: #0f172a;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.sl-tab-count {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #e2e8f0;
  font-size: 11px;
  font-weight: 700;
}
.sl-lines-help {
  margin: 0;
  color: #64748b;
  font-size: 12.5px;
}
.sl-lines-empty {
  display: grid;
  gap: 10px;
  justify-items: center;
  padding: 24px 16px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #fff;
  color: #64748b;
  font-size: 13px;
}
.sl-lines-empty p { margin: 0; }
.sl-card {
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.sl-card.is-selected { border-color: #6366f1; }
.sl-card-head {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px;
  background: #f7f9fc;
  border-bottom: 1px solid #eef2f7;
}
.sl-card-tools,
.sl-item-tools {
  display: flex;
  gap: 4px;
  flex: none;
}
.sl-btn {
  width: 44px;
  height: 44px;
  border: 1px solid #d7dee7;
  border-radius: 9px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.sl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sl-btn.is-danger { color: #dc2626; border-color: #f6cfcf; }
.sl-items {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sl-item {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid #f1f5f9;
}
.sl-item-main {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  min-width: 0;
}
.sl-field {
  display: grid;
  gap: 3px;
  min-width: 0;
}
/* Inputs keep an intrinsic min width, which would push rows past the card. */
.sl-field input { min-width: 0; }
.sl-field-grow { flex: 1; min-width: 0; }
.sl-field-price { width: 120px; flex: none; }
.sl-field-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.sl-field input {
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid #d7dee7;
  border-radius: 9px;
  background: #fff;
  font: inherit;
  font-size: 14px;
  color: #0f172a;
}
.sl-field input:focus {
  outline: 2px solid #6366f1;
  outline-offset: -1px;
  border-color: #6366f1;
}
.sl-card-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
}
.sl-card-foot .btn { min-height: 44px; }
.sl-add-section { align-self: stretch; min-height: 44px; }

/* Phones: the section title keeps the full row and its four tools drop below. */
@media (max-width: 560px) {
  .sl-card-head { flex-wrap: wrap; }
  .sl-card-head .sl-field-grow { flex: 1 1 100%; }
  .sl-card-tools { margin-left: auto; }
  .sl-field-price { width: 104px; }
}
</style>
