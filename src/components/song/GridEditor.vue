<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGridMeasureActions } from '@/composables/useGridMeasureActions'
import type { GridSection } from '@/lib/chordpro/types'
import GridMeasureList from '@/components/song/GridMeasureList.vue'

interface Props {
  modelValue: GridSection
}

interface Emits {
  (e: 'update:modelValue', value: GridSection): void
  (e: 'select-measure', value: number | null): void
}

const props = defineProps<Props>()

const emit = defineEmits<Emits>()

const selectedMeasureIndex = ref<number | null>(null)
const modelValue = computed(() => props.modelValue)

const {
  measures,
  displayMeasures,
  selectMeasure,
  handleAddMeasure,
  handleCopyMeasure,
  handleDeleteMeasure,
  handleDeleteLyrics,
  handleDeleteChords,
  handleSwapMeasure,
  handleMergeLyrics,
  handleReorder
} = useGridMeasureActions({
  modelValue,
  selectedMeasureIndex,
  onUpdate: (section) => emit('update:modelValue', section),
  onSelect: (index) => emit('select-measure', index)
})
</script>

<template>
  <div class="grid-editor">
    <div class="editor-header">
      <span class="editor-title">🎵 小節編集</span>
    </div>

    <GridMeasureList
      :measures="displayMeasures"
      :measures-length="measures.length"
      :selected-measure-index="selectedMeasureIndex"
      @select="selectMeasure"
      @add-measure="handleAddMeasure"
      @copy="handleCopyMeasure"
      @swap="handleSwapMeasure"
      @merge="handleMergeLyrics"
      @delete-measure="handleDeleteMeasure"
      @delete-lyrics="handleDeleteLyrics"
      @delete-chords="handleDeleteChords"
      @reorder="handleReorder"
    />

    <div class="editor-hint">
      クリックで小節を選択 ・ ドラッグでコード並び替え
    </div>
  </div>
</template>

<style scoped>
.grid-editor {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
  position: sticky;
  top: -16px; /* Adjust based on padding */
  background: var(--color-bg-secondary);
  padding: var(--spacing-sm) 0;
  z-index: 10;
  border-bottom: 1px solid var(--color-border);
}

.editor-title {
  font-weight: 600;
  color: var(--color-text);
}

.editor-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-top: var(--spacing-sm);
  text-align: center;
}

</style>
