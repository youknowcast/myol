<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useGridMeasureEditor } from '@/composables/useGridMeasureEditor'
import { useSortableGrid } from '@/composables/useSortableGrid'
import type { GridSection, Measure } from '@/lib/chordpro/types'
import GridMeasureItem from '@/components/song/GridMeasureItem.vue'

interface Props {
  modelValue: GridSection
}

interface Emits {
  (e: 'update:modelValue', value: GridSection): void
  (e: 'select-measure', value: number | null): void
}

const props = defineProps<Props>()

const emit = defineEmits<Emits>()

const containerRef = ref<HTMLElement | null>(null)
const selectedMeasureIndex = ref<number | null>(null)

const measures = computed(() => props.modelValue.measures ?? [])

  const {
    displayMeasures,
    addMeasure,
    copyMeasure,
    deleteMeasure,
    deleteLyrics,
    deleteChords,
    swapMeasure,
    mergeLyrics,
    reorderCells
  } = useGridMeasureEditor({
    measures,
    selectedMeasureIndex
  })


// Emit updated grid
function emitUpdate(newMeasures: Measure[]) {
  emit('update:modelValue', {
    ...props.modelValue,
    measures: newMeasures.map(measure => ({
      cells: measure.cells.map(cell => ({ ...cell })),
      lyricsHint: measure.lyricsHint
    }))
  })
}

// Select a measure
function selectMeasure(index: number) {
  selectedMeasureIndex.value = selectedMeasureIndex.value === index ? null : index
  emit('select-measure', selectedMeasureIndex.value)
}

// Add measure operations
function handleAddMeasure(position: 'end' | 'before' | 'after') {
  emitUpdate(addMeasure(position))
}

// Copy measure
function handleCopyMeasure() {
  emitUpdate(copyMeasure())
}

// Delete measure (prevent if has lyrics)
function handleDeleteMeasure() {
  emitUpdate(deleteMeasure())
}

function handleDeleteLyrics() {
  emitUpdate(deleteLyrics())
}

function handleDeleteChords() {
  emitUpdate(deleteChords())
}

// Swap measure with adjacent
function handleSwapMeasure(direction: 'left' | 'right') {
  emitUpdate(swapMeasure(direction))
}

function handleMergeLyrics(direction: 'left' | 'right', sourceIndex: number) {
  emitUpdate(mergeLyrics(direction, sourceIndex))
}

// Handle drag & drop reorder within a measure
function handleReorder(measureIndex: number, orderedCellIds: string[]) {
  emitUpdate(reorderCells(measureIndex, orderedCellIds))
}

const { init: initSortable, destroy: destroySortable } = useSortableGrid({
  onReorder: handleReorder
})

onMounted(() => {
  nextTick(() => {
    initSortable(containerRef.value)
  })
})

watch(() => props.modelValue, () => {
  nextTick(() => {
    initSortable(containerRef.value)
  })
}, { deep: true })

onUnmounted(() => {
  destroySortable()
})
</script>

<template>
  <div ref="containerRef" class="grid-editor">
    <div class="editor-header">
      <span class="editor-title">🎵 小節編集</span>
    </div>

    <div class="measures-container">
      <template v-for="(measure, measureIndex) in displayMeasures" :key="measureIndex">
        <!-- Bar line (left) -->
        <div class="bar-line" v-if="measureIndex === 0">║</div>

        <!-- Measure wrapper (clickable for selection) -->
        <GridMeasureItem
          :measure="measure"
          :measure-index="measureIndex"
          :measures-length="measures.length"
          :selected="selectedMeasureIndex === measureIndex"
          @select="selectMeasure"
          @add-measure="handleAddMeasure"
          @copy="handleCopyMeasure"
          @swap="handleSwapMeasure"
          @merge="handleMergeLyrics"
          @delete-measure="handleDeleteMeasure"
          @delete-lyrics="handleDeleteLyrics"
          @delete-chords="handleDeleteChords"
        />

        <!-- Bar line (right) -->
        <div class="bar-line">{{ measureIndex === measures.length - 1 ? '║' : '│' }}</div>
      </template>
    </div>

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

.measures-container {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  font-family: var(--font-mono);
}

.bar-line {
  color: var(--color-grid-bar);
  font-weight: 600;
  font-size: 1.2rem;
  padding: 0 2px;
}


.editor-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-top: var(--spacing-sm);
  text-align: center;
}



.editable-cell {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  cursor: grab;
  user-select: none;
  transition: all var(--transition-fast);
  min-width: 2.5rem;
  text-align: center;
}

.editable-cell:hover {
  transform: scale(1.05);
}

.editable-cell:active {
  cursor: grabbing;
}

.cell-chord {
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

.cell-empty {
  background: var(--color-bg-secondary);
  color: var(--color-text-muted);
}

.cell-repeat {
  background: var(--color-accent);
  color: white;
}

/* SortableJS states */
.cell-ghost {
  opacity: 0.4;
  background: var(--color-primary) !important;
}

.cell-chosen {
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  transform: scale(1.1);
}

.cell-drag {
  opacity: 0.9;
}

@media (min-width: 768px) {
  .editable-cell {
    min-width: 3.5rem;
    font-size: 1rem;
  }
}

.lyrics-hint {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  text-align: center;
  padding: 2px var(--spacing-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  opacity: 0.8;
  margin-top: 2px;
}
</style>
