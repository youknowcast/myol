<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Sortable from 'sortablejs'
import type { GridSection, GridCell } from '@/lib/chordpro/types'
import {
  getMeasures as getGridMeasures,
  flattenRows,
  cellsToRows,
  addMeasure as addMeasureOp,
  deleteMeasure as deleteMeasureOp,
  copyMeasure as copyMeasureOp,
  swapMeasures as swapMeasuresOp,
  reorderCellsInMeasure
} from '@/composables/useGridOperations'

interface Props {
  modelValue: GridSection
  beatsPerMeasure?: number
}

interface Emits {
  (e: 'update:modelValue', value: GridSection): void
}

const props = withDefaults(defineProps<Props>(), {
  beatsPerMeasure: 4
})

const emit = defineEmits<Emits>()

const containerRef = ref<HTMLElement | null>(null)
const selectedMeasureIndex = ref<number | null>(null)

// Flatten cells from the grid section
const flatCells = computed(() => flattenRows(props.modelValue.rows))

// Get measures from flat cells
const measures = computed(() => {
  const gridMeasures = getGridMeasures(flatCells.value)
  return gridMeasures.map((m, idx) => ({
    ...m,
    cells: m.cells.map((cell, cellIdx) => ({
      id: `${idx}-${cellIdx}`,
      ...cell
    }))
  }))
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
function emitUpdate(newCells: GridCell[]) {
  emit('update:modelValue', {
    ...props.modelValue,
    rows: cellsToRows(newCells)
  })
}

// Select a measure
function selectMeasure(index: number) {
  selectedMeasureIndex.value = selectedMeasureIndex.value === index ? null : index
}

// Add measure operations
function handleAddMeasure(position: 'end' | 'before' | 'after') {
  if (position === 'end') {
    const result = addMeasureOp(flatCells.value, 'end', props.beatsPerMeasure)
    emitUpdate(result)
  } else if (selectedMeasureIndex.value !== null) {
    const pos = position === 'before'
      ? { before: selectedMeasureIndex.value }
      : { after: selectedMeasureIndex.value }
    const result = addMeasureOp(flatCells.value, pos, props.beatsPerMeasure)
    emitUpdate(result)
  }
}

// Copy measure
function handleCopyMeasure() {
  if (selectedMeasureIndex.value === null) return
  const result = copyMeasureOp(flatCells.value, selectedMeasureIndex.value)
  emitUpdate(result)
}

// Delete measure
function handleDeleteMeasure() {
  if (selectedMeasureIndex.value === null) return
  if (measures.value.length <= 1) return
  const result = deleteMeasureOp(flatCells.value, selectedMeasureIndex.value)
  selectedMeasureIndex.value = null
  emitUpdate(result)
}

// Swap measure with adjacent
function handleSwapMeasure(direction: 'left' | 'right') {
  if (selectedMeasureIndex.value === null) return
  const targetIdx = direction === 'left'
    ? selectedMeasureIndex.value - 1
    : selectedMeasureIndex.value + 1
  if (targetIdx < 0 || targetIdx >= measures.value.length) return

  const result = swapMeasuresOp(flatCells.value, selectedMeasureIndex.value, targetIdx)
  selectedMeasureIndex.value = targetIdx
  emitUpdate(result)
}

// Handle drag & drop reorder within a measure
function handleReorder(measureIndex: number, orderedCellIds: string[]) {
  const measure = measures.value[measureIndex]
  if (!measure) return

  // Map IDs back to cells
  const cellMap = new Map<string, GridCell>()
  measure.cells.forEach((cell: { id: string } & GridCell) => {
    cellMap.set(cell.id, { type: cell.type, value: cell.value })
  })

  const newOrder = orderedCellIds
    .map(id => cellMap.get(id))
    .filter((c): c is GridCell => c !== undefined)

  if (newOrder.length !== measure.cells.length) {
    console.warn('Cell count mismatch during reorder')
    return
  }

  const result = reorderCellsInMeasure(flatCells.value, measureIndex, newOrder)
  emitUpdate(result)
}

// Initialize SortableJS for drag & drop
function initSortable() {
  if (!containerRef.value) return

  const measureContainers = containerRef.value.querySelectorAll('.measure-cells')

  measureContainers.forEach((container, measureIndex) => {
    Sortable.create(container as HTMLElement, {
      animation: 150,
      ghostClass: 'cell-ghost',
      chosenClass: 'cell-chosen',
      dragClass: 'cell-drag',
      group: 'cells',
      onEnd: (evt) => {
        const items = Array.from(evt.to.querySelectorAll('[data-id]'))
          .map(el => el.getAttribute('data-id'))
          .filter((id): id is string => id !== null)

        handleReorder(measureIndex, items)
      }
    })
  })
}

onMounted(() => {
  nextTick(() => {
    initSortable()
  })
})

watch(() => props.modelValue, () => {
  nextTick(() => {
    initSortable()
  })
}, { deep: true })

onUnmounted(() => {
  // SortableJS instances are automatically cleaned up when DOM elements are removed
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
      <template v-for="(measure, measureIndex) in measures" :key="measureIndex">
        <!-- Bar line (left) -->
        <div class="bar-line" v-if="measureIndex === 0">║</div>

        <!-- Measure wrapper (clickable for selection) -->
        <div
          class="measure-wrapper"
          :class="{ selected: selectedMeasureIndex === measureIndex }"
          @click.self="selectMeasure(measureIndex)"
        >
          <!-- Measure cells (sortable) -->
          <div class="measure-cells" @click="selectMeasure(measureIndex)">
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
</style>
