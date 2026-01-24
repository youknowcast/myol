<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGridMeasureActions } from '@/components/song/composables/useGridMeasureActions'
import type { GridSection } from '@/lib/chordpro/types'
import GridMeasureList from '@/components/song/GridMeasureList.vue'

interface Props {
  modelValue: GridSection
  sectionIndex: number
  prevSectionIndex: number | null
  nextSectionIndex: number | null
}

interface Emits {
  (e: 'update:modelValue', value: GridSection): void
  (e: 'select-measure', value: number | null): void
  (e: 'move-cell-across-section', payload: {
    fromSectionIndex: number
    toSectionIndex: number
    fromMeasureIndex: number
    toMeasureIndex: number
    fromOrder: string[]
    toOrder: string[]
    movedCellId: string | null
    oldIndex: number | null
    newIndex: number | null
  }): void
  (e: 'move-measure-across-section', payload: {
    fromSectionIndex: number
    toSectionIndex: number
    fromMeasureIndex: number
  }): void
}

const props = defineProps<Props>()

const emit = defineEmits<Emits>()

const selectedMeasureIndex = ref<number | null>(null)
const modelValue = computed(() => props.modelValue)

const {
  measures,
  displayMeasures,
  selectMeasure,
  handleAddMeasure,
  handleCopyMeasure,
  handleDeleteMeasure,
  handleDeleteLyrics,
  handleDeleteChords,
  handleSwapMeasure,
  handleMergeLyrics,
  handleReorder,
  handleMoveAcrossMeasures
} = useGridMeasureActions({
  modelValue,
  selectedMeasureIndex,
  onUpdate: (section) => emit('update:modelValue', section),
  onSelect: (index) => emit('select-measure', index)
})

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
  if (payload.fromSectionIndex !== payload.toSectionIndex) {
    emit('move-cell-across-section', payload)
    return
  }
  handleMoveAcrossMeasures(payload)
}

function handleMoveSection(payload: { direction: 'prev' | 'next'; measureIndex: number }) {
  const targetSectionIndex = payload.direction === 'prev'
    ? props.prevSectionIndex
    : props.nextSectionIndex
  if (targetSectionIndex === null) return
  emit('move-measure-across-section', {
    fromSectionIndex: props.sectionIndex,
    toSectionIndex: targetSectionIndex,
    fromMeasureIndex: payload.measureIndex
  })
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
      @select="selectMeasure"
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
