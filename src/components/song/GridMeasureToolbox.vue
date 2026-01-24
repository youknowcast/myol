<script setup lang="ts">
import { computed } from 'vue'
import ActionMenu from '@/components/ui/ActionMenu.vue'

interface Props {
  measureIndex: number
  measuresLength: number
  hasLyrics: boolean
  canMovePrevSection: boolean
  canMoveNextSection: boolean
  align: 'left' | 'right'
}

interface Emits {
  (e: 'add-measure', value: 'end' | 'before' | 'after'): void
  (e: 'copy'): void
  (e: 'swap', value: 'left' | 'right'): void
  (e: 'merge', direction: 'left' | 'right', sourceIndex: number): void
  (e: 'delete-measure'): void
  (e: 'delete-lyrics'): void
  (e: 'delete-chords'): void
  (e: 'move-section', direction: 'prev' | 'next'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const deleteMenuItems = computed(() => [
  {
    id: 'delete-measure',
    label: '小節削除',
    onSelect: () => emit('delete-measure'),
    disabled: props.measuresLength <= 1
  },
  {
    id: 'delete-lyrics',
    label: '歌詞削除',
    onSelect: () => emit('delete-lyrics')
  },
  {
    id: 'delete-chords',
    label: 'コード削除',
    onSelect: () => emit('delete-chords')
  }
])
</script>

<template>
  <div class="measure-toolbox" :class="`align-${align}`" @click.stop>
    <div class="tool-group">
      <button class="toolbar-btn" @click.stop="emit('add-measure', 'before')" title="前に挿入">
        ➕⬅
      </button>
      <button class="toolbar-btn" @click.stop="emit('add-measure', 'after')" title="後に挿入">
        ➕➡
      </button>
      <button class="toolbar-btn" @click.stop="emit('add-measure', 'end')" title="末尾に小節を追加">
        ➕末
      </button>
      <button class="toolbar-btn" @click.stop="emit('copy')" title="コピー">
        📋
      </button>
    </div>
    <div class="tool-group">
      <button
        class="toolbar-btn"
        @click.stop="emit('move-section', 'prev')"
        :disabled="!canMovePrevSection"
        title="前のセクションへ移動"
      >
        ⬅Section
      </button>
      <button
        class="toolbar-btn"
        @click.stop="emit('move-section', 'next')"
        :disabled="!canMoveNextSection"
        title="次のセクションへ移動"
      >
        Section➡
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
        :disabled="!hasLyrics || measureIndex === 0"
        title="歌詞を左にマージ"
      >
        📝⬅
      </button>
      <button
        class="toolbar-btn"
        @click.stop="emit('merge', 'right', measureIndex)"
        :disabled="!hasLyrics || measureIndex === measuresLength - 1"
        title="歌詞を右にマージ"
      >
        📝➡
      </button>
    </div>
    <div class="tool-group">
      <ActionMenu :items="deleteMenuItems">
        <template #trigger>
          <span class="toolbar-btn toolbar-btn-danger">🗑</span>
        </template>
      </ActionMenu>
    </div>
  </div>
</template>

<style scoped>
.measure-toolbox {
  position: absolute;
  top: -44px;
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

.measure-toolbox.align-left {
  left: 0;
}

.measure-toolbox.align-right {
  right: 0;
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
</style>
