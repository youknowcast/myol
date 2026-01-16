<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Sortable from 'sortablejs'
import type { GridSection, GridRow, GridCell } from '@/lib/chordpro/types'

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

// Flatten all cells for editing
interface EditableCell {
  id: string
  type: GridCell['type']
  value?: string
  rowIndex: number
  cellIndex: number
}

const containerRef = ref<HTMLElement | null>(null)

// Selected measure index for operations
const selectedMeasureIndex = ref<number | null>(null)

// Check if using parts mode
const hasParts = computed(() => {
  return props.modelValue.parts && props.modelValue.parts.length > 0
})

// Get all rows (from parts or direct rows) - reserved for part editing feature
const _allRows = computed(() => {
  if (hasParts.value && props.modelValue.parts) {
    return props.modelValue.parts.flatMap(p => p.rows)
  }
  return props.modelValue.rows
})

// Selected part index for operations - reserved for part editing feature
const _selectedPartIndex = ref<number | null>(null)
// Suppress unused warnings
void _allRows
void _selectedPartIndex

// Create a flat array of editable cells (chords only, bars are visual separators)
const editableCells = computed(() => {
  const cells: EditableCell[] = []
  props.modelValue.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, cellIndex) => {
      cells.push({
        id: `${rowIndex}-${cellIndex}`,
        type: cell.type,
        value: cell.value,
        rowIndex,
        cellIndex
      })
    })
  })
  return cells
})

// Group cells into measures for display
interface Measure {
  cells: EditableCell[]
  startIndex: number
  endIndex: number
}

const measures = computed(() => {
  const result: Measure[] = []
  let currentMeasure: EditableCell[] = []
  let startIndex = 0

  editableCells.value.forEach((cell, index) => {
    const isBar = ['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth'].includes(cell.type)

    if (isBar) {
      if (currentMeasure.length > 0) {
        result.push({
          cells: currentMeasure,
          startIndex,
          endIndex: index - 1
        })
        currentMeasure = []
      }
      startIndex = index + 1
    } else {
      currentMeasure.push(cell)
    }
  })

  // Add remaining cells
  if (currentMeasure.length > 0) {
    result.push({
      cells: currentMeasure,
      startIndex,
      endIndex: editableCells.value.length - 1
    })
  }

  return result
})

function getCellClass(cell: EditableCell): string {
  switch (cell.type) {
    case 'chord': return 'cell-chord'
    case 'empty': return 'cell-empty'
    case 'repeat': return 'cell-repeat'
    default: return ''
  }
}

function getCellDisplay(cell: EditableCell): string {
  switch (cell.type) {
    case 'empty': return '·'
    case 'repeat': return cell.value || '%'
    case 'chord': return cell.value || ''
    default: return ''
  }
}

// Rebuild grid from drag result
function rebuildGrid(measureIndex: number, newOrder: string[]) {
  const newRows: GridRow[] = []
  const allCells: GridCell[] = []

  // Flatten current grid
  props.modelValue.rows.forEach(row => {
    row.cells.forEach(cell => {
      allCells.push({ ...cell })
    })
  })

  // Find the measure boundaries
  const measure = measures.value[measureIndex]
  if (!measure) return

  // Get the cells that were reordered
  const reorderedCells = newOrder.map(id => {
    const [rowIdx, cellIdx] = id.split('-').map(Number)
    const row = props.modelValue.rows[rowIdx!]
    if (!row) return null
    return row.cells[cellIdx!]
  }).filter((c): c is GridCell => c !== null)

  // Replace cells in the measure
  let cellCounter = 0
  const updatedCells: GridCell[] = []

  allCells.forEach((cell, index) => {
    const isBar = ['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth'].includes(cell.type)

    if (isBar) {
      updatedCells.push(cell)
    } else if (index >= measure.startIndex && index <= measure.endIndex && cellCounter < reorderedCells.length) {
      updatedCells.push(reorderedCells[cellCounter]!)
      cellCounter++
    } else {
      updatedCells.push(cell)
    }
  })

  // Recreate rows (single row for now)
  newRows.push({ cells: updatedCells })

  emit('update:modelValue', {
    ...props.modelValue,
    rows: newRows
  })
}

// Select a measure
function selectMeasure(index: number) {
  selectedMeasureIndex.value = selectedMeasureIndex.value === index ? null : index
}

// Create empty measure cells based on beats per measure
function createEmptyMeasure(): GridCell[] {
  const cells: GridCell[] = []
  for (let i = 0; i < props.beatsPerMeasure; i++) {
    cells.push({ type: 'empty' })
  }
  return cells
}

// Get all cells as a flat array
function getAllCells(): GridCell[] {
  const allCells: GridCell[] = []
  props.modelValue.rows.forEach(row => {
    row.cells.forEach(cell => {
      allCells.push({ ...cell })
    })
  })
  return allCells
}

// Find cell indices for a measure
function getMeasureCellRange(measureIndex: number): { start: number; end: number } | null {
  const allCells = getAllCells()
  let measureCount = 0
  let start = 0

  for (let i = 0; i < allCells.length; i++) {
    const cell = allCells[i]!
    const isBar = ['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth'].includes(cell.type)

    if (isBar) {
      if (measureCount === measureIndex) {
        return { start, end: i - 1 }
      }
      measureCount++
      start = i + 1
    }
  }

  // Last measure
  if (measureCount === measureIndex) {
    return { start, end: allCells.length - 1 }
  }

  return null
}

// Add a new measure at position
function addMeasure(position: 'end' | 'before' | 'after') {
  const allCells = getAllCells()
  const newMeasureCells = createEmptyMeasure()
  let insertIndex: number

  if (position === 'end') {
    // Find the last barDouble position and insert before it
    const lastBarIndex = allCells.length - 1
    insertIndex = lastBarIndex
  } else if (selectedMeasureIndex.value !== null) {
    const range = getMeasureCellRange(selectedMeasureIndex.value)
    if (!range) return
    insertIndex = position === 'before' ? range.start : range.end + 2 // +2 to skip the bar
  } else {
    // No selection, add at end
    const lastBarIndex = allCells.length - 1
    insertIndex = lastBarIndex
  }

  // Insert bar + new cells
  const newCells = [
    ...allCells.slice(0, insertIndex),
    { type: 'bar' as const },
    ...newMeasureCells,
    ...allCells.slice(insertIndex)
  ]

  emit('update:modelValue', {
    ...props.modelValue,
    rows: [{ cells: newCells }]
  })
}

// Copy selected measure
function copyMeasure() {
  if (selectedMeasureIndex.value === null) return

  const range = getMeasureCellRange(selectedMeasureIndex.value)
  if (!range) return

  const allCells = getAllCells()
  const measureCells = allCells.slice(range.start, range.end + 1).map(c => ({ ...c }))

  // Find end position (before last barDouble)
  const insertIndex = allCells.length - 1

  const newCells = [
    ...allCells.slice(0, insertIndex),
    { type: 'bar' as const },
    ...measureCells,
    ...allCells.slice(insertIndex)
  ]

  emit('update:modelValue', {
    ...props.modelValue,
    rows: [{ cells: newCells }]
  })
}

// Delete selected measure
function deleteMeasure() {
  if (selectedMeasureIndex.value === null) return
  if (measures.value.length <= 1) return // Don't delete last measure

  const range = getMeasureCellRange(selectedMeasureIndex.value)
  if (!range) return

  const allCells = getAllCells()

  // Remove cells including the following bar
  let endIndex = range.end + 1
  if (endIndex < allCells.length && allCells[endIndex]?.type === 'bar') {
    endIndex++
  }

  const newCells = [
    ...allCells.slice(0, range.start),
    ...allCells.slice(endIndex)
  ]

  // Reset selection
  selectedMeasureIndex.value = null

  emit('update:modelValue', {
    ...props.modelValue,
    rows: [{ cells: newCells }]
  })
}

// Swap selected measure with adjacent
function swapMeasure(direction: 'left' | 'right') {
  if (selectedMeasureIndex.value === null) return

  const currentIdx = selectedMeasureIndex.value
  const targetIdx = direction === 'left' ? currentIdx - 1 : currentIdx + 1

  if (targetIdx < 0 || targetIdx >= measures.value.length) return

  const currentRange = getMeasureCellRange(currentIdx)
  const targetRange = getMeasureCellRange(targetIdx)
  if (!currentRange || !targetRange) return

  const allCells = getAllCells()
  const currentCells = allCells.slice(currentRange.start, currentRange.end + 1)
  const targetCells = allCells.slice(targetRange.start, targetRange.end + 1)

  // Swap cells in place
  const newCells = [...allCells]

  // Replace current with target
  newCells.splice(currentRange.start, currentCells.length, ...targetCells)

  // Adjust target range after first splice
  const sizeDiff = targetCells.length - currentCells.length
  const adjustedTargetStart = direction === 'left'
    ? targetRange.start
    : targetRange.start + sizeDiff

  newCells.splice(adjustedTargetStart, targetCells.length, ...currentCells)

  // Update selection to follow the swapped measure
  selectedMeasureIndex.value = targetIdx

  emit('update:modelValue', {
    ...props.modelValue,
    rows: [{ cells: newCells }]
  })
}

function initSortable() {
  if (!containerRef.value) return

  // Initialize sortable for each measure
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

        rebuildGrid(measureIndex, items)
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
          @click="addMeasure('end')"
          title="末尾に小節を追加"
        >
          ➕ 追加
        </button>
        <template v-if="selectedMeasureIndex !== null">
          <button
            class="toolbar-btn"
            @click="addMeasure('before')"
            title="前に挿入"
          >
            ⬅ 前に
          </button>
          <button
            class="toolbar-btn"
            @click="addMeasure('after')"
            title="後に挿入"
          >
            後に ➡
          </button>
          <button
            class="toolbar-btn"
            @click="copyMeasure"
            title="コピー"
          >
            📋 コピー
          </button>
          <button
            class="toolbar-btn"
            @click="swapMeasure('left')"
            :disabled="selectedMeasureIndex === 0"
            title="左へ移動"
          >
            ⬅
          </button>
          <button
            class="toolbar-btn"
            @click="swapMeasure('right')"
            :disabled="selectedMeasureIndex === measures.length - 1"
            title="右へ移動"
          >
            ➡
          </button>
          <button
            class="toolbar-btn toolbar-btn-danger"
            @click="deleteMeasure"
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

.editor-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
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
