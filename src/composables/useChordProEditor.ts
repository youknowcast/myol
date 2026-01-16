/**
 * ChordPro Editor Composable
 * Provides a clean interface to the ChordPro Editor Store
 */

import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useChordProEditorStore } from '@/stores/chordproEditor'

/**
 * Main composable for ChordPro editing
 * Use this in SongEditPage
 */
export function useChordProEditor() {
	const store = useChordProEditorStore()
	const {
		document,
		sections,
		gridSections,
		isDirty
	} = storeToRefs(store)

	return {
		// State (readonly)
		document,
		sections,
		gridSections,
		isDirty,

		// Actions
		loadDocument: store.loadDocument,
		serialize: store.serialize,
		markAsSaved: store.markAsSaved
	}
}

/**
 * Composable for measure editing within a grid section
 * Use this in GridEditor
 */
export function useMeasureEditor() {
	const store = useChordProEditorStore()
	const {
		selectedSectionIndex,
		selectedMeasureIndex,
		currentMeasures,
		currentGridSection
	} = storeToRefs(store)

	const measures = computed(() => currentMeasures.value)

	const selectedMeasure = computed(() => {
		if (selectedMeasureIndex.value === null) return null
		return measures.value[selectedMeasureIndex.value] ?? null
	})

	const canDeleteSelectedMeasure = computed(() => {
		if (selectedMeasureIndex.value === null) return false
		if (measures.value.length <= 1) return false
		const measure = measures.value[selectedMeasureIndex.value]
		if (measure?.lyricsHint && measure.lyricsHint.trim() !== '') return false
		return true
	})

	function selectSection(index: number) {
		store.selectSection(index)
	}

	function selectMeasure(index: number | null) {
		store.selectMeasure(index)
	}

	function addMeasure(position: 'end' | 'before' | 'after', beatsPerMeasure = 4) {
		store.addMeasure(position, beatsPerMeasure)
	}

	function deleteMeasure() {
		if (!canDeleteSelectedMeasure.value) {
			return { success: false, error: '歌詞が付いている小節は削除できません' }
		}
		try {
			store.deleteMeasure()
			return { success: true }
		} catch (e) {
			return { success: false, error: (e as Error).message }
		}
	}

	function swapMeasure(direction: 'left' | 'right') {
		if (selectedMeasureIndex.value === null) return
		const targetIdx = direction === 'left'
			? selectedMeasureIndex.value - 1
			: selectedMeasureIndex.value + 1
		if (targetIdx < 0 || targetIdx >= measures.value.length) return

		store.swapMeasures(selectedMeasureIndex.value, targetIdx)
		store.selectMeasure(targetIdx)
	}

	function updateCells(measureIndex: number, cells: { type: string; value?: string }[]) {
		store.updateMeasureCells(measureIndex, cells as any)
	}

	return {
		// State
		selectedSectionIndex,
		selectedMeasureIndex,
		measures,
		selectedMeasure,
		currentGridSection,
		canDeleteSelectedMeasure,

		// Actions
		selectSection,
		selectMeasure,
		addMeasure,
		deleteMeasure,
		swapMeasure,
		updateCells
	}
}

/**
 * Composable for playback-related functionality
 * Use this in SongDetailPage
 */
export function useChordProPlayback() {
	const store = useChordProEditorStore()
	const { sections, gridSections } = storeToRefs(store)

	// Count total measures across all grid sections
	const totalMeasures = computed(() => {
		let count = 0
		for (const { section } of gridSections.value) {
			if (section.content.kind === 'grid') {
				const grid = section.content
				if (grid.measures && grid.measures.length > 0) {
					count += grid.measures.length
				} else {
					// Fallback: estimate from rows
					for (const row of grid.rows) {
						for (const cell of row.cells) {
							if (['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth'].includes(cell.type)) {
								// This is a rough estimate
							}
						}
					}
				}
			}
		}
		return Math.max(count, 1)
	})

	return {
		sections,
		gridSections,
		totalMeasures,
		loadDocument: store.loadDocument
	}
}
