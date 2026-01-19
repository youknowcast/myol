<script setup lang="ts">
import { computed } from 'vue'
import { useGridViewState, type CellWithMeasure } from '@/composables/useGridViewState'
import { useGridCellDisplay } from '@/composables/useGridCellDisplay'
import { useGridCellHighlight } from '@/composables/useGridCellHighlight'
import type { Section, GridSection } from '@/lib/chordpro/types'

interface Props {
  section: Section
  currentMeasure?: number
  measureOffset?: number  // Offset for this section in global measure count
  isPlaying?: boolean
}

interface Emits {
  (e: 'seek', value: number): void
}

const props = withDefaults(defineProps<Props>(), {
  currentMeasure: 0,
  measureOffset: 0,
  isPlaying: false
})

const emit = defineEmits<Emits>()

const gridContent = props.section.content as GridSection

const { rowHints, cellsWithMeasures } = useGridViewState({
  grid: gridContent,
  currentMeasure: computed(() => (props.isPlaying ? props.currentMeasure : -1)),
  measureOffset: computed(() => props.measureOffset)
})


const { getCellDisplay } = useGridCellDisplay()
const { getGridViewCellClass, isBarCell } = useGridCellHighlight()

interface MeasureGroup {
  measureIndex: number
  cells: CellWithMeasure[]
  isCurrent: boolean
}

const measureRows = computed(() =>
  cellsWithMeasures.value.map((row) => {
    const groups: MeasureGroup[] = []

    row.forEach((cell) => {
      if (isBarCell(cell)) return
      const lastGroup = groups[groups.length - 1]
      if (!lastGroup || lastGroup.measureIndex !== cell.measureIndex) {
        groups.push({
          measureIndex: cell.measureIndex,
          cells: [cell],
          isCurrent: cell.isCurrentMeasure
        })
        return
      }
      lastGroup.cells.push(cell)
      if (cell.isCurrentMeasure) {
        lastGroup.isCurrent = true
      }
    })

    return groups
  })
)

function getCellClass(cell: CellWithMeasure): string[] {
  return getGridViewCellClass(cell)
}

function getRowMeasureIndex(row: MeasureGroup[]): number {
  if (row.length === 0) return props.measureOffset
  return Math.min(...row.map((group) => group.measureIndex))
}
</script>

<template>
  <div class="grid-section">
    <div v-if="section.label" class="section-label">{{ section.label }}</div>

    <div class="chord-grid-container">
      <div class="chord-grid">
        <!-- Each row contains chords and optional lyrics underneath -->
        <div
          v-for="(row, rowIndex) in measureRows"
          :key="rowIndex"
          class="grid-row-group"
          @click="emit('seek', getRowMeasureIndex(row))"
        >
          <div class="grid-row">
            <div
              v-for="group in row"
              :key="group.measureIndex"
              class="grid-measure"
              :class="{ 'is-current-measure': group.isCurrent }"
            >
              <div
                v-for="(cell, cellIndex) in group.cells"
                :key="cellIndex"
                class="grid-cell"
                :class="getCellClass(cell)"
              >
                <span class="grid-cell-text">{{ getCellDisplay(cell) }}</span>
              </div>
            </div>
          </div>

          <div
            v-if="rowHints[rowIndex]"
            class="grid-lyrics-row"
          >
            {{ rowHints[rowIndex] }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-section {
  margin-bottom: var(--spacing-xl);
}

.section-label {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--spacing-sm);
}

.chord-grid-container {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-lg);
  background: rgba(0, 0, 0, 0.2);
  padding: var(--spacing-md);
}

.chord-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.grid-row-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  cursor: pointer;
}

.grid-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-sm);
  font-family: var(--font-mono);
}

.grid-row-group:has(.is-current-measure) .grid-lyrics-row {
  color: var(--color-primary);
  font-weight: 500;
}

.grid-measure {
  display: flex;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
}

.grid-measure.is-current-measure {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.2);
}

.grid-lyrics-row {
  padding-left: var(--spacing-xs);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.grid-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  min-width: 1.5rem;
  min-height: 2rem;
}

.grid-cell-text {
  white-space: nowrap;
}

.grid-bar {
  color: var(--color-grid-bar);
  font-weight: 600;
}

.grid-chord {
  color: var(--color-chord);
  font-weight: 600;
}

.grid-empty {
  color: var(--color-text-muted);
}

.grid-repeat {
  color: var(--color-accent);
  font-weight: 600;
}

.current-measure {
  background: var(--color-primary);
  color: white !important;
}

@media (min-width: 768px) {
  .grid-cell {
    min-width: 1.75rem;
    font-size: 1rem;
  }
  .grid-lyrics-row {
    font-size: 0.95rem;
  }
}

@media (min-width: 1024px) {
  .grid-cell {
    min-width: 2rem;
  }
}
</style>
