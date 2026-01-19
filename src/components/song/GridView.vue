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
const { getGridViewCellClass } = useGridCellHighlight()

function getCellClass(cell: CellWithMeasure): string[] {
  return getGridViewCellClass(cell)
}

function getRowMeasureIndex(row: CellWithMeasure[]): number {
  if (row.length === 0) return props.measureOffset
  return row.reduce((min, cell) => Math.min(min, cell.measureIndex), row[0]!.measureIndex)
}
</script>

<template>
  <div class="grid-section">
    <div v-if="section.label" class="section-label">{{ section.label }}</div>

    <div class="chord-grid-container">
      <div class="chord-grid">
        <!-- Each row contains chords and optional lyrics underneath -->
        <div
          v-for="(row, rowIndex) in cellsWithMeasures"
          :key="rowIndex"
          class="grid-row-group"
          @click="emit('seek', getRowMeasureIndex(row))"
        >
          <div class="grid-row">
            <div
              v-for="(cell, cellIndex) in row"
              :key="cellIndex"
              class="grid-cell"
              :class="getCellClass(cell)"
            >
              <span class="grid-cell-text">{{ getCellDisplay(cell) }}</span>
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

.grid-row-group:has(.current-measure) .grid-lyrics-row {
  color: var(--color-primary);
  font-weight: 500;
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
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  min-height: 2.75rem;
  border: 1px solid transparent;
  transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
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

.grid-cell:has(.current-measure) {
  border-color: rgba(99, 102, 241, 0.6);
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
}

@media (min-width: 768px) {
  .grid-cell {
    min-width: 3.5rem;
    font-size: 1rem;
  }
  .grid-lyrics-row {
    font-size: 0.95rem;
  }
}

@media (min-width: 1024px) {
  .grid-cell {
    min-width: 4rem;
  }
}
</style>
