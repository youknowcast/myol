import { computed, type ComputedRef, type Ref } from 'vue'
import type { GridSection, Measure } from '@/lib/chordpro/types'
import { useGridMeasureEditor } from '@/composables/useGridMeasureEditor'

interface UseGridMeasureActionsOptions {
  modelValue: ComputedRef<GridSection>
  selectedMeasureIndex: Ref<number | null>
  onUpdate: (section: GridSection) => void
  onSelect?: (index: number | null) => void
}

export function useGridMeasureActions(options: UseGridMeasureActionsOptions) {
  const measures = computed(() => options.modelValue.value.measures ?? [])

  const {
    displayMeasures,
    addMeasure,
    copyMeasure,
    deleteMeasure,
    deleteLyrics,
    deleteChords,
    swapMeasure,
    mergeLyrics,
    reorderCells
  } = useGridMeasureEditor({
    measures,
    selectedMeasureIndex: options.selectedMeasureIndex
  })

  function emitUpdate(newMeasures: Measure[]) {
    options.onUpdate({
      ...options.modelValue.value,
      measures: newMeasures.map(measure => ({
        cells: measure.cells.map(cell => ({ ...cell })),
        lyricsHint: measure.lyricsHint
      }))
    })
  }

  function selectMeasure(index: number) {
    const next = options.selectedMeasureIndex.value === index ? null : index
    options.selectedMeasureIndex.value = next
    options.onSelect?.(next)
  }

  function handleAddMeasure(position: 'end' | 'before' | 'after') {
    emitUpdate(addMeasure(position))
  }

  function handleCopyMeasure() {
    emitUpdate(copyMeasure())
  }

  function handleDeleteMeasure() {
    emitUpdate(deleteMeasure())
  }

  function handleDeleteLyrics() {
    emitUpdate(deleteLyrics())
  }

  function handleDeleteChords() {
    emitUpdate(deleteChords())
  }

  function handleSwapMeasure(direction: 'left' | 'right') {
    emitUpdate(swapMeasure(direction))
  }

  function handleMergeLyrics(direction: 'left' | 'right', sourceIndex: number) {
    emitUpdate(mergeLyrics(direction, sourceIndex))
  }

  function handleReorder(measureIndex: number, orderedCellIds: string[]) {
    emitUpdate(reorderCells(measureIndex, orderedCellIds))
  }

  return {
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
  }
}
