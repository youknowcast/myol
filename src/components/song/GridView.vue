<script setup lang="ts">
import type { Section, GridSection } from '@/lib/chordpro/types'

interface Props {
  section: Section
}

const props = defineProps<Props>()

const gridContent = props.section.content as GridSection

function getCellClass(type: string): string {
  switch (type) {
    case 'bar':
    case 'barDouble':
    case 'barEnd':
    case 'repeatStart':
    case 'repeatEnd':
    case 'repeatBoth':
      return 'grid-bar'
    case 'chord':
      return 'grid-chord'
    case 'empty':
      return 'grid-empty'
    case 'repeat':
      return 'grid-repeat'
    default:
      return ''
  }
}

function getCellDisplay(cell: { type: string; value?: string }): string {
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
        v-for="(row, rowIndex) in gridContent.rows"
        :key="rowIndex"
        class="grid-row"
      >
        <span
          v-for="(cell, cellIndex) in row.cells"
          :key="cellIndex"
          class="grid-cell"
          :class="getCellClass(cell.type)"
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
