<script setup lang="ts">
import { computed } from 'vue'
import { useChordProEditorStore } from '@/stores/chordproEditor'
import { useEditableMeasures } from '@/components/song/composables/useEditableMeasures'
import type { GridSection } from '@/lib/chordpro/types'
import GridMeasureList from '@/components/song/GridMeasureList.vue'

interface Props {
  modelValue: GridSection
  sectionIndex: number
  prevSectionIndex: number | null
  nextSectionIndex: number | null
  selectedMeasureIndex: number | null
}

interface Emits {
  (e: 'select-measure', value: number | null): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const store = useChordProEditorStore()

const measures = computed(() => props.modelValue.measures ?? [])
const { displayMeasures } = useEditableMeasures(measures)

function cellIndexFromId(id: string | null, fallback: number | null): number {
  if (id) {
    const parsed = Number.parseInt(id.split('-')[1] ?? '', 10)
    if (!Number.isNaN(parsed)) return parsed
  }
  return typeof fallback === 'number' ? fallback : -1
}

function toggleMeasureSelection(index: number) {
  emit('select-measure', props.selectedMeasureIndex === index ? null : index)
}

function handleAddMeasure(position: 'end' | 'before' | 'after') {
  store.addMeasure(props.sectionIndex, position, props.selectedMeasureIndex)
}

function handleCopyMeasure() {
  if (props.selectedMeasureIndex === null) return
  store.copyMeasure(props.sectionIndex, props.selectedMeasureIndex)
}

function handleDeleteMeasure() {
  if (props.selectedMeasureIndex === null) return
  store.deleteMeasure(props.sectionIndex, props.selectedMeasureIndex)
  emit('select-measure', null)
}

function handleDeleteLyrics() {
  if (props.selectedMeasureIndex === null) return
  store.clearLyrics(props.sectionIndex, props.selectedMeasureIndex)
}

function handleDeleteChords() {
  if (props.selectedMeasureIndex === null) return
  store.clearChords(props.sectionIndex, props.selectedMeasureIndex)
}

function handleSwapMeasure(direction: 'left' | 'right') {
  const current = props.selectedMeasureIndex
  if (current === null) return
  const target = direction === 'left' ? current - 1 : current + 1
  if (target < 0 || target >= measures.value.length) return
  store.swapMeasure(props.sectionIndex, current, direction)
  emit('select-measure', target)
}

function handleMergeLyrics(direction: 'left' | 'right', sourceIndex: number) {
  store.mergeLyrics(props.sectionIndex, sourceIndex, direction)
}

function handleReorder(measureIndex: number, orderedCellIds: string[]) {
  const newOrder = orderedCellIds.map(id => cellIndexFromId(id, null))
  store.reorderCells(props.sectionIndex, measureIndex, newOrder)
}

function handleMoveCell(payload: {
  fromSectionIndex: number
  toSectionIndex: number
  fromMeasureIndex: number
  toMeasureIndex: number
  fromOrder: string[]
  toOrder: string[]
  movedCellId: string | null
  oldIndex: number | null
  newIndex: number | null
}) {
  const sourceCellIndex = cellIndexFromId(payload.movedCellId, payload.oldIndex)
  if (sourceCellIndex < 0) return
  store.moveCell({
    fromSectionIndex: payload.fromSectionIndex,
    toSectionIndex: payload.toSectionIndex,
    fromMeasureIndex: payload.fromMeasureIndex,
    toMeasureIndex: payload.toMeasureIndex,
    sourceCellIndex,
    newIndex: payload.newIndex
  })
}

function handleMoveSection(payload: { direction: 'prev' | 'next'; measureIndex: number }) {
  const targetSectionIndex = payload.direction === 'prev'
    ? props.prevSectionIndex
    : props.nextSectionIndex
  if (targetSectionIndex === null) return
  store.moveMeasureAcrossSections(props.sectionIndex, targetSectionIndex, payload.measureIndex)
}

</script>

<template>
  <div class="grid-editor">
    <div class="editor-header">
      <span class="editor-title">🎵 小節編集</span>
    </div>

    <GridMeasureList
      :measures="displayMeasures"
      :measures-length="measures.length"
      :selected-measure-index="selectedMeasureIndex"
      :section-index="sectionIndex"
      :can-move-prev-section="prevSectionIndex !== null"
      :can-move-next-section="nextSectionIndex !== null"
      @select="toggleMeasureSelection"
      @add-measure="handleAddMeasure"
      @copy="handleCopyMeasure"
      @swap="handleSwapMeasure"
      @merge="handleMergeLyrics"
      @delete-measure="handleDeleteMeasure"
      @delete-lyrics="handleDeleteLyrics"
      @delete-chords="handleDeleteChords"
      @reorder="handleReorder"
      @move-cell="handleMoveCell"
      @move-section="handleMoveSection"
    />

    <div class="editor-hint">
      クリックで小節を選択 ・ ドラッグでコード並び替え
    </div>
  </div>
</template>

<style scoped>
.grid-editor {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
  position: sticky;
  top: -16px; /* Adjust based on padding */
  background: var(--color-bg-secondary);
  padding: var(--spacing-sm) 0;
  z-index: 10;
  border-bottom: 1px solid var(--color-border);
}

.editor-title {
  font-weight: 600;
  color: var(--color-text);
}

.editor-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-top: var(--spacing-sm);
  text-align: center;
}

</style>
