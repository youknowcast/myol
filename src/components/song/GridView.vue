<script setup lang="ts">
import { computed } from 'vue'
import type { Section, GridSection } from '@/lib/chordpro/types'

interface Props {
  section: Section
  currentMeasure?: number
  isPlaying?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  currentMeasure: 0,
  isPlaying: false
})

const gridContent = props.section.content as GridSection

// Track measure index for each cell
interface CellWithMeasure {
  type: string
  value?: string
  measureIndex: number
  isCurrentMeasure: boolean
}

const cellsWithMeasures = computed(() => {
  let measureIndex = 0
  const result: CellWithMeasure[][] = []

  for (const row of gridContent.rows) {
    const rowCells: CellWithMeasure[] = []

    for (const cell of row.cells) {
      const isBar = cell.type === 'bar' || cell.type === 'barDouble' ||
                    cell.type === 'barEnd' || cell.type === 'repeatStart' ||
                    cell.type === 'repeatEnd' || cell.type === 'repeatBoth'

      if (isBar) {
        // Bar itself belongs to current measure
        rowCells.push({
          ...cell,
          measureIndex: measureIndex,
          isCurrentMeasure: measureIndex === props.currentMeasure
        })
        // Next non-bar cell starts a new measure
        measureIndex++
      } else {
        rowCells.push({
          ...cell,
          measureIndex: measureIndex,
          isCurrentMeasure: measureIndex === props.currentMeasure
        })
      }
    }

    result.push(rowCells)
  }

  return result
})

function getCellClass(cell: CellWithMeasure): string[] {
  const classes: string[] = []

  switch (cell.type) {
    case 'bar':
    case 'barDouble':
    case 'barEnd':
    case 'repeatStart':
    case 'repeatEnd':
    case 'repeatBoth':
      classes.push('grid-bar')
      break
    case 'chord':
      classes.push('grid-chord')
      break
    case 'empty':
      classes.push('grid-empty')
      break
    case 'repeat':
      classes.push('grid-repeat')
      break
  }

  if (cell.isCurrentMeasure && cell.type === 'chord') {
    classes.push('current-measure')
  }

  return classes
}

function getCellDisplay(cell: CellWithMeasure): string {
  switch (cell.type) {
    case 'bar': return '│'
    case 'barDouble': return '║'
    case 'barEnd': return '║'
    case 'repeatStart': return '║:'
    case 'repeatEnd': return ':║'
    case 'repeatBoth': return ':║:'
    case 'empty': return '·'
    case 'repeat': return cell.value || '%'
    case 'chord': return cell.value || ''
    default: return ''
  }
}
</script>

<template>
  <div class="grid-section">
    <div v-if="section.label" class="section-label">{{ section.label }}</div>

    <div class="chord-grid">
      <div
        v-for="(row, rowIndex) in cellsWithMeasures"
        :key="rowIndex"
        class="grid-row"
      >
        <span
          v-for="(cell, cellIndex) in row"
          :key="cellIndex"
          class="grid-cell"
          :class="getCellClass(cell)"
        >
          {{ getCellDisplay(cell) }}
        </span>
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

.chord-grid {
  font-family: var(--font-mono);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  overflow-x: auto;
}

.grid-row {
  display: flex;
  align-items: center;
  min-height: 2rem;
  flex-wrap: wrap;
}

.grid-cell {
  padding: var(--spacing-xs) var(--spacing-sm);
  text-align: center;
  min-width: 2.5rem;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.grid-bar {
  color: var(--color-grid-bar);
  font-weight: 600;
  min-width: 1.5rem;
  padding: var(--spacing-xs) 2px;
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
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
  transform: scale(1.1);
}

@media (min-width: 768px) {
  .grid-cell {
    min-width: 3.5rem;
    font-size: 1rem;
  }
}

@media (min-width: 1024px) {
  .grid-cell {
    min-width: 4rem;
  }
}
</style>
