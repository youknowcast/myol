<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useGridMeasureEditor } from '@/composables/useGridMeasureEditor'
import { useSortableGrid } from '@/composables/useSortableGrid'
import type { GridSection, GridCell, Measure } from '@/lib/chordpro/types'
import { gridRowsFromMeasures } from '@/lib/chordpro/parser'

interface Props {
  modelValue: GridSection
}

interface Emits {
  (e: 'update:modelValue', value: GridSection): void
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
  swapMeasure,
  reorderCells
} = useGridMeasureEditor({
  measures,
  selectedMeasureIndex
})

// Display helpers
function getCellClass(cell: GridCell): string {
  switch (cell.type) {
    case 'chord': return 'cell-chord'
    case 'empty': return 'cell-empty'
    case 'repeat': return 'cell-repeat'
    default: return ''
  }
}

function getCellDisplay(cell: GridCell): string {
  switch (cell.type) {
    case 'empty': return '·'
    case 'repeat': return cell.value || '%'
    case 'chord': return cell.value || ''
    default: return ''
  }
}

// Emit updated grid
function emitUpdate(newMeasures: Measure[]) {
  emit('update:modelValue', {
    ...props.modelValue,
    parts: undefined,
    measures: newMeasures.map(measure => ({
      cells: measure.cells.map(cell => ({ ...cell })),
      lyricsHint: measure.lyricsHint
    })),
    rows: gridRowsFromMeasures(newMeasures)
  })
}

// Select a measure
function selectMeasure(index: number) {
  selectedMeasureIndex.value = selectedMeasureIndex.value === index ? null : index
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

// Swap measure with adjacent
function handleSwapMeasure(direction: 'left' | 'right') {
  emitUpdate(swapMeasure(direction))
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
      <div class="editor-toolbar">
        <button
          class="toolbar-btn"
          @click="handleAddMeasure('end')"
          title="末尾に小節を追加"
        >
          ➕ 追加
        </button>
        <template v-if="selectedMeasureIndex !== null">
          <button
            class="toolbar-btn"
            @click="handleAddMeasure('before')"
            title="前に挿入"
          >
            ⬅ 前に
          </button>
          <button
            class="toolbar-btn"
            @click="handleAddMeasure('after')"
            title="後に挿入"
          >
            後に ➡
          </button>
          <button
            class="toolbar-btn"
            @click="handleCopyMeasure"
            title="コピー"
          >
            📋 コピー
          </button>
          <button
            class="toolbar-btn"
            @click="handleSwapMeasure('left')"
            :disabled="selectedMeasureIndex === 0"
            title="左へ移動"
          >
            ⬅
          </button>
          <button
            class="toolbar-btn"
            @click="handleSwapMeasure('right')"
            :disabled="selectedMeasureIndex === measures.length - 1"
            title="右へ移動"
          >
            ➡
          </button>
          <button
            class="toolbar-btn toolbar-btn-danger"
            @click="handleDeleteMeasure"
            :disabled="measures.length <= 1"
            title="削除"
          >
            🗑
          </button>
        </template>
      </div>
    </div>

    <div class="measures-container">
      <template v-for="(measure, measureIndex) in displayMeasures" :key="measureIndex">
        <!-- Bar line (left) -->
        <div class="bar-line" v-if="measureIndex === 0">║</div>

        <!-- Measure wrapper (clickable for selection) -->
        <div
          class="measure-wrapper"
          :class="{ selected: selectedMeasureIndex === measureIndex }"
          @click.self="selectMeasure(measureIndex)"
        >
          <!-- Measure cells (sortable) -->
          <div
            class="measure-cells"
            :data-measure-index="measureIndex"
            @click="selectMeasure(measureIndex)"
          >
            <div
              v-for="cell in measure.cells"
              :key="cell.id"
              :data-id="cell.id"
              class="editable-cell"
              :class="getCellClass(cell)"
            >
              {{ getCellDisplay(cell) }}
            </div>
          </div>
          <!-- Lyrics hint (non-editable) -->
          <div
            v-if="measure.lyricsHint"
            class="lyrics-hint"
            :title="measure.lyricsHint"
          >
            {{ measure.lyricsHint }}
          </div>
        </div>

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

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.toolbar-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  background: var(--color-bg-card);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn-danger:hover:not(:disabled) {
  background: var(--color-error, #ef4444);
  border-color: var(--color-error, #ef4444);
}

.measure-wrapper {
  position: relative;
  border-radius: var(--radius-sm);
  padding: 2px;
  transition: all var(--transition-fast);
}

.measure-wrapper:hover {
  background: rgba(99, 102, 241, 0.1);
}

.measure-wrapper.selected {
  background: rgba(99, 102, 241, 0.2);
  box-shadow: 0 0 0 2px var(--color-primary);
}

.editor-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-top: var(--spacing-sm);
  text-align: center;
}

.measure-cells {
  display: flex;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs);
  background: var(--color-bg-card);
  border-radius: var(--radius-sm);
  min-height: 2.5rem;
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
