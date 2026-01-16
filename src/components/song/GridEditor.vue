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
      <span class="editor-hint">ドラッグで順序変更</span>
    </div>

    <div class="measures-container">
      <template v-for="(measure, measureIndex) in measures" :key="measureIndex">
        <!-- Bar line (left) -->
        <div class="bar-line" v-if="measureIndex === 0">║</div>

        <!-- Measure cells (sortable) -->
        <div class="measure-cells">
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

        <!-- Bar line (right) -->
        <div class="bar-line">{{ measureIndex === measures.length - 1 ? '║' : '│' }}</div>
      </template>
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
