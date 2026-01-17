<script setup lang="ts">
import { ref } from 'vue'
import type { GridCell } from '@/lib/chordpro/types'
import type { EditableMeasure } from '@/composables/useGridMeasureEditor'

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

const isDeleteMenuOpen = ref(false)

function toggleDeleteMenu() {
  isDeleteMenuOpen.value = !isDeleteMenuOpen.value
}

function closeDeleteMenu() {
  isDeleteMenuOpen.value = false
}

function handleDeleteMeasure() {
  emit('delete-measure')
  closeDeleteMenu()
}

function handleDeleteLyrics() {
  emit('delete-lyrics')
  closeDeleteMenu()
}

function handleDeleteChords() {
  emit('delete-chords')
  closeDeleteMenu()
}

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
    <div
      v-if="selected"
      class="measure-toolbox"
      @click.stop
    >
      <div class="tool-group">
        <button
          class="toolbar-btn"
          @click.stop="emit('add-measure', 'before')"
          title="前に挿入"
        >
          ➕⬅
        </button>
        <button
          class="toolbar-btn"
          @click.stop="emit('add-measure', 'after')"
          title="後に挿入"
        >
          ➕➡
        </button>
        <button
          class="toolbar-btn"
          @click.stop="emit('add-measure', 'end')"
          title="末尾に小節を追加"
        >
          ➕末
        </button>
        <button
          class="toolbar-btn"
          @click.stop="emit('copy')"
          title="コピー"
        >
          📋
        </button>
      </div>
      <div class="tool-group">
        <button
          class="toolbar-btn"
          @click.stop="emit('swap', 'left')"
          :disabled="measureIndex === 0"
          title="左へ移動"
        >
          ⬅
        </button>
        <button
          class="toolbar-btn"
          @click.stop="emit('swap', 'right')"
          :disabled="measureIndex === measuresLength - 1"
          title="右へ移動"
        >
          ➡
        </button>
      </div>
      <div class="tool-group">
        <button
          class="toolbar-btn"
          @click.stop="emit('merge', 'left', measureIndex)"
          :disabled="!measure.lyricsHint || measureIndex === 0"
          title="歌詞を左にマージ"
        >
          📝⬅
        </button>
        <button
          class="toolbar-btn"
          @click.stop="emit('merge', 'right', measureIndex)"
          :disabled="!measure.lyricsHint || measureIndex === measuresLength - 1"
          title="歌詞を右にマージ"
        >
          📝➡
        </button>
      </div>
      <div class="tool-group delete-group">
        <button
          class="toolbar-btn toolbar-btn-danger"
          @click.stop="toggleDeleteMenu"
          :disabled="measuresLength <= 1"
          title="削除メニュー"
        >
          🗑
        </button>
        <div v-if="isDeleteMenuOpen" class="delete-menu">
          <button class="delete-menu-item" @click.stop="handleDeleteMeasure">
            小節削除
          </button>
          <button class="delete-menu-item" @click.stop="handleDeleteLyrics">
            歌詞削除
          </button>
          <button class="delete-menu-item" @click.stop="handleDeleteChords">
            コード削除
          </button>
        </div>
      </div>
    </div>
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
.measure-toolbox {
  position: absolute;
  top: -44px;
  left: 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--spacing-xs);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  z-index: 20;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: var(--spacing-xs);
  margin-right: var(--spacing-xs);
  border-right: 1px solid var(--color-border);
}

.tool-group:last-child {
  border-right: none;
  margin-right: 0;
  padding-right: 0;
}

.delete-group {
  position: relative;
}

.delete-menu {
  position: absolute;
  top: 32px;
  right: 0;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  min-width: 120px;
  z-index: 30;
}

.delete-menu-item {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: transparent;
  border: none;
  text-align: left;
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.75rem;
}

.delete-menu-item:hover {
  background: var(--color-bg-secondary);
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
