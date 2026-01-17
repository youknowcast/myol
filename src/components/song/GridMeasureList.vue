<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useSortableGrid } from '@/composables/useSortableGrid'
import type { EditableMeasure } from '@/composables/useGridMeasureEditor'
import GridMeasureItem from '@/components/song/GridMeasureItem.vue'

interface Props {
  measures: EditableMeasure[]
  measuresLength: number
  selectedMeasureIndex: number | null
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
  (e: 'reorder', measureIndex: number, orderedCellIds: string[]): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const containerRef = ref<HTMLElement | null>(null)

const { init: initSortable, destroy: destroySortable } = useSortableGrid({
  onReorder: (measureIndex, orderedCellIds) => emit('reorder', measureIndex, orderedCellIds)
})

function refreshSortable() {
  nextTick(() => {
    initSortable(containerRef.value)
  })
}

onMounted(() => {
  refreshSortable()
})

watch(() => props.measures, refreshSortable, { deep: true })

onUnmounted(() => {
  destroySortable()
})
</script>

<template>
  <div ref="containerRef" class="measures-container">
    <template v-for="(measure, measureIndex) in measures" :key="measureIndex">
      <div class="bar-line" v-if="measureIndex === 0">║</div>
      <GridMeasureItem
        :measure="measure"
        :measure-index="measureIndex"
        :measures-length="measuresLength"
        :selected="selectedMeasureIndex === measureIndex"
        @select="(index) => emit('select', index)"
        @add-measure="(position) => emit('add-measure', position)"
        @copy="() => emit('copy')"
        @swap="(direction) => emit('swap', direction)"
        @merge="(direction, sourceIndex) => emit('merge', direction, sourceIndex)"
        @delete-measure="() => emit('delete-measure')"
        @delete-lyrics="() => emit('delete-lyrics')"
        @delete-chords="() => emit('delete-chords')"
      />
      <div class="bar-line">{{ measureIndex === measuresLength - 1 ? '║' : '│' }}</div>
    </template>
  </div>
</template>

<style scoped>
.measures-container {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  font-family: var(--font-mono);
}

.bar-line {
  color: var(--color-grid-bar);
  font-weight: 600;
  font-size: 1.2rem;
  padding: 0 2px;
}
</style>
