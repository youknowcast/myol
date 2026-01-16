<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
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
const gridRef = ref<HTMLElement | null>(null)

// Auto-scroll to current measure when it changes
watch(() => props.currentMeasure, async () => {
  await nextTick()
  if (!gridRef.value) return

  const currentCell = gridRef.value.querySelector('.current-measure')
  if (currentCell) {
    currentCell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }
})

// Track measure index for each cell
interface CellWithMeasure {
  type: string
  value?: string
  measureIndex: number
  isCurrentMeasure: boolean
}

const cellsWithMeasures = computed(() => {
  // measureIndex increments only when we see a bar AFTER seeing non-bar content
  // This prevents double-increment at row boundaries (|| ... || || ... ||)
  let measureIndex = 0
  let hasSeenFirstBar = false
  let hasSeenNonBarSinceLastBar = false
  const result: CellWithMeasure[][] = []

  for (const row of gridContent.rows) {
    const rowCells: CellWithMeasure[] = []

    for (const cell of row.cells) {
      const isBar = cell.type === 'bar' || cell.type === 'barDouble' ||
                    cell.type === 'barEnd' || cell.type === 'repeatStart' ||
                    cell.type === 'repeatEnd' || cell.type === 'repeatBoth'

      if (isBar) {
        if (hasSeenFirstBar && hasSeenNonBarSinceLastBar) {
          // This bar ends the current measure (only if we had content)
          measureIndex++
        }
        hasSeenFirstBar = true
        hasSeenNonBarSinceLastBar = false

        rowCells.push({
          ...cell,
          measureIndex: measureIndex,
          isCurrentMeasure: measureIndex === props.currentMeasure
        })
      } else {
        hasSeenNonBarSinceLastBar = true
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

// Check if any cell in this row is the current measure
function rowHasCurrentMeasure(row: CellWithMeasure[]): boolean {
  return row.some(cell => cell.isCurrentMeasure)
}
</script>

<template>
  <div ref="gridRef" class="grid-section">
    <div v-if="section.label" class="section-label">{{ section.label }}</div>

    <div class="chord-grid">
      <!-- Each row contains chords and optional lyrics underneath -->
      <div
        v-for="(row, rowIndex) in cellsWithMeasures"
        :key="rowIndex"
        class="grid-row-group"
      >
        <!-- Chord row -->
        <div class="grid-row">
          <span
            v-for="(cell, cellIndex) in row"
            :key="cellIndex"
            class="grid-cell"
            :class="getCellClass(cell)"
          >
            {{ getCellDisplay(cell) }}
          </span>
        </div>

        <!-- Lyrics row (if available for this row) -->
        <div
          v-if="gridContent.lyricsHints && gridContent.lyricsHints[rowIndex]"
          class="grid-lyrics-row"
          :class="{ 'has-current': rowHasCurrentMeasure(row) }"
        >
          {{ gridContent.lyricsHints[rowIndex] }}
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

.chord-grid {
  overflow-x: auto;
}

.grid-row-group {
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-xs);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  transition: all var(--transition-fast);
}

.grid-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
  font-family: var(--font-mono);
}

.grid-lyrics-row {
  margin-top: 2px;
  padding-left: var(--spacing-sm);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.grid-row-group:has(.current-measure),
.grid-row-group.has-current {
  background: rgba(99, 102, 241, 0.1);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}

.grid-row-group.has-current .grid-lyrics-row {
  color: var(--color-primary);
  font-weight: 500;
}

.grid-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 3rem;
  height: 2.5rem;
  padding: var(--spacing-xs) 2px;
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
  transform: scale(1.05);
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
