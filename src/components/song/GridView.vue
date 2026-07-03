<script setup lang="ts">
import { computed } from 'vue'
import { useGridViewState, type CellWithMeasure } from '@/components/song/composables/useGridViewState'
import { cellGlyph, cellKind } from '@/lib/chordpro/cellDisplay'
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

const { lyricsHints, cellsWithMeasures } = useGridViewState({
  grid: gridContent,
  currentMeasure: computed(() => (props.isPlaying ? props.currentMeasure : -1)),
  measureOffset: computed(() => props.measureOffset)
})

interface MeasureGroup {
  measureIndex: number
  cells: CellWithMeasure[]
  isCurrent: boolean
  lyricsHint: string
  startBar?: 'repeatStart'
  endBar?: 'repeatEnd' | 'barEnd'
}

const measureRows = computed(() =>
  cellsWithMeasures.value.map((row) => {
    const groups: MeasureGroup[] = []

    row.forEach((cell) => {
      const lastGroup = groups[groups.length - 1]
      if (!lastGroup || lastGroup.measureIndex !== cell.measureIndex) {
        const localIndex = cell.measureIndex - props.measureOffset
        const measure = gridContent.measures[localIndex]
        groups.push({
          measureIndex: cell.measureIndex,
          cells: [cell],
          isCurrent: cell.isCurrentMeasure,
          lyricsHint: lyricsHints.value[localIndex] || '',
          startBar: measure?.startBar,
          endBar: measure?.endBar
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
  const classes = [`grid-${cellKind(cell)}`]
  if (cell.isCurrentMeasure && cell.type === 'chord') {
    classes.push('current-measure')
  }
  return classes
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
              :class="{ 'is-current-measure': group.isCurrent, 'is-empty': !group.cells.length }"
            >
              <div class="grid-measure-body">
                <span v-if="group.startBar" class="grid-bar-mark">║:</span>
                <div
                  v-for="(cell, cellIndex) in group.cells"
                  :key="cellIndex"
                  class="grid-cell"
                  :class="getCellClass(cell)"
                >
                  <span class="grid-cell-text">{{ cellGlyph(cell) }}</span>
                </div>
                <span v-if="group.endBar" class="grid-bar-mark">{{ group.endBar === 'repeatEnd' ? ':║' : '║.' }}</span>
              </div>
              <div v-if="group.lyricsHint" class="grid-lyrics-row">
                {{ group.lyricsHint }}
              </div>
            </div>
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
  grid-template-columns: repeat(2, max-content);
  justify-content: start;
  gap: var(--spacing-sm);
  font-family: var(--font-mono);
}

.grid-measure {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  width: fit-content;
  max-width: 100%;
}

.grid-measure-body,
.grid-lyrics-row {
  width: fit-content;
}

.grid-measure.is-empty {
  opacity: 0.6;
}

.grid-measure.is-current-measure {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.2);
}

.grid-lyrics-row {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  text-align: left;
  white-space: nowrap;
}

.grid-measure.is-current-measure .grid-lyrics-row {
  color: var(--color-primary);
  font-weight: 500;
}

.grid-measure-body {
  display: flex;
  gap: var(--spacing-xs);
}

.grid-bar-mark {
  color: var(--color-grid-bar);
  font-weight: 600;
  align-self: center;
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
