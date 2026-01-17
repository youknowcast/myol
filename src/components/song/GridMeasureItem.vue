<script setup lang="ts">
import type { GridCell } from '@/lib/chordpro/types'
import type { EditableMeasure } from '@/composables/useGridMeasureEditor'
import GridMeasureToolbox from '@/components/song/GridMeasureToolbox.vue'

interface Props {
  measure: EditableMeasure
  measureIndex: number
  measuresLength: number
  selected: boolean
}

interface Emits {
  (e: 'select', value: number): void
  (e: 'add-measure', value: 'end' | 'before' | 'after'): void
  (e: 'copy'): void
  (e: 'swap', value: 'left' | 'right'): void
  (e: 'merge', direction: 'left' | 'right', sourceIndex: number): void
  (e: 'delete-measure'): void
  (e: 'delete-lyrics'): void
  (e: 'delete-chords'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

function getCellClass(cell: GridCell): string {
  switch (cell.type) {
    case 'chord':
      return 'cell-chord'
    case 'empty':
      return 'cell-empty'
    case 'repeat':
      return 'cell-repeat'
    default:
      return ''
  }
}

function getCellDisplay(cell: GridCell): string {
  switch (cell.type) {
    case 'empty':
      return '·'
    case 'repeat':
      return cell.value || '%'
    case 'chord':
      return cell.value || ''
    default:
      return ''
  }
}
</script>

<template>
  <div
    class="measure-wrapper"
    :class="{ selected: selected }"
    @click.self="emit('select', measureIndex)"
  >
    <GridMeasureToolbox
      v-if="selected"
      :measure-index="measureIndex"
      :measures-length="measuresLength"
      :has-lyrics="Boolean(measure.lyricsHint)"
      @add-measure="(position) => emit('add-measure', position)"
      @copy="() => emit('copy')"
      @swap="(direction) => emit('swap', direction)"
      @merge="(direction, sourceIndex) => emit('merge', direction, sourceIndex)"
      @delete-measure="() => emit('delete-measure')"
      @delete-lyrics="() => emit('delete-lyrics')"
      @delete-chords="() => emit('delete-chords')"
    />
    <div
      class="measure-cells"
      :data-measure-index="measureIndex"
      @click="emit('select', measureIndex)"
    >
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
    <div
      v-if="measure.lyricsHint"
      class="lyrics-hint"
      :title="measure.lyricsHint"
      @click="emit('select', measureIndex)"
    >
      {{ measure.lyricsHint }}
    </div>
  </div>
</template>

<style scoped>

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

.lyrics-hint {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  text-align: center;
  padding: 2px var(--spacing-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  opacity: 0.8;
  margin-top: 2px;
}
</style>
