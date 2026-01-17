<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useGridViewState, type CellWithMeasure } from '@/composables/useGridViewState'
import type { Section, GridSection } from '@/lib/chordpro/types'

interface Props {
  section: Section
  currentMeasure?: number
  measureOffset?: number  // Offset for this section in global measure count
  isPlaying?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  currentMeasure: 0,
  measureOffset: 0,
  isPlaying: false
})

const gridContent = props.section.content as GridSection
const gridRef = ref<HTMLElement | null>(null)
const rowHeight = 72 // Matches .grid-row-group height in CSS

const { rowHints, cellsWithMeasures, currentRowIndex, contentTransform } = useGridViewState({
  grid: gridContent,
  currentMeasure: computed(() => props.currentMeasure),
  measureOffset: computed(() => props.measureOffset),
  isPlaying: computed(() => props.isPlaying),
  rowHeight
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
  <div ref="gridRef" class="grid-section" :class="{ 'karaoke-mode': isPlaying }">
    <div v-if="section.label && !isPlaying" class="section-label">{{ section.label }}</div>

    <div class="chord-grid-container">
      <div class="chord-grid" :style="{ transform: contentTransform }">
        <!-- Each row contains chords and optional lyrics underneath -->
        <div
          v-for="(row, rowIndex) in cellsWithMeasures"
          :key="rowIndex"
          class="grid-row-group"
          :class="{ 'has-current': rowHasCurrentMeasure(row) }"
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
  overflow: hidden;
  height: 400px; /* Show about 4-5 rows */
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-lg);
  background: rgba(0, 0, 0, 0.2);
}

.karaoke-mode .chord-grid-container {
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 20%,
    black 80%,
    transparent 100%
  );
}

.chord-grid {
  transition: transform 0.4s cubic-bezier(0.2, 0, 0.2, 1);
  padding: 20px;
}

.karaoke-mode .chord-grid {
  /* This ensures we can always center the first and last rows */
  padding-top: 160px; /* Half container height minus half row height */
  padding-bottom: 240px;
}

.grid-row-group {
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  transition: all var(--transition-fast);
  height: 72px; /* Fixed height to match rowHeight in script */
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
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
