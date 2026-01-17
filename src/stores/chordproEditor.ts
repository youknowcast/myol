/**
 * ChordPro Editor Store
 * Single Source of Truth for song editing state
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { generateChordPro, parseChordProToExtended } from '@/lib/chordpro/parser'
import type { ParsedSong, GridSection, GridCell, Measure } from '@/lib/chordpro/types'

/**
 * Extract measures from grid section
 */
function extractMeasuresFromGrid(grid: GridSection): Measure[] {
	return grid.measures.map(measure => ({
		cells: measure.cells.map(cell => ({ ...cell })),
		lyricsHint: measure.lyricsHint
	}))
}

/**
 * Convert measures back to GridSection format
 */
function measuresToGridSection(measures: Measure[], shape?: string): GridSection {
	return {
		kind: 'grid',
		shape,
		measures
	}
}

export const useChordProEditorStore = defineStore('chordproEditor', () => {
	// State
	const document = ref<ParsedSong | null>(null)
	const originalContent = ref('')
	const selectedSectionIndex = ref<number | null>(null)
	const selectedMeasureIndex = ref<number | null>(null)

	// Getters
	const sections = computed(() => document.value?.sections ?? [])

	const gridSections = computed(() =>
		sections.value
			.map((section, index) => ({ section, index }))
			.filter(({ section }) => section.content.kind === 'grid')
	)

	const currentSection = computed(() => {
		if (selectedSectionIndex.value === null || !document.value) return null
		return document.value.sections[selectedSectionIndex.value] ?? null
	})

	const currentGridSection = computed((): GridSection | null => {
		const section = currentSection.value
		if (!section || section.content.kind !== 'grid') return null
		return section.content as GridSection
	})

	const currentMeasures = computed((): Measure[] => {
		const grid = currentGridSection.value
		if (!grid) return []

		// Use measures if available, otherwise extract from rows
		if (grid.measures && grid.measures.length > 0) {
			return grid.measures
		}
		return extractMeasuresFromGrid(grid)
	})

	// Total measures across all grid sections (for playback)
	const totalMeasures = computed(() => {
		if (!document.value) return 1
		let count = 0

		for (const section of document.value.sections) {
			if (section.content.kind === 'grid') {
				const grid = section.content as GridSection
				count += grid.measures.length
			}
		}
		return Math.max(count, 1)
	})

	const isDirty = computed(() => {
		if (!document.value) return false
		return generateChordPro(document.value) !== originalContent.value
	})

	// Actions
	function loadDocument(content: string) {
		originalContent.value = content
		document.value = parseChordProToExtended(content)
		selectedSectionIndex.value = null
		selectedMeasureIndex.value = null
	}

	function selectSection(index: number | null) {
		selectedSectionIndex.value = index
		selectedMeasureIndex.value = null
	}

	function selectMeasure(index: number | null) {
		selectedMeasureIndex.value = index
	}

	function addMeasure(position: 'end' | 'before' | 'after') {
		if (selectedSectionIndex.value === null || !document.value) return

		const section = document.value.sections[selectedSectionIndex.value]
		if (!section || section.content.kind !== 'grid') return

		const grid = section.content as GridSection
		const measures = grid.measures && grid.measures.length > 0
			? [...grid.measures]
			: extractMeasuresFromGrid(grid)

		const newMeasure: Measure = {
			cells: [{ type: 'empty' as const }],
			lyricsHint: undefined
		}

		if (position === 'end') {
			measures.push(newMeasure)
		} else if (selectedMeasureIndex.value !== null) {
			const insertIndex = position === 'before'
				? selectedMeasureIndex.value
				: selectedMeasureIndex.value + 1
			measures.splice(insertIndex, 0, newMeasure)
		}

		// Update the grid section
		const updated = measuresToGridSection(measures, grid.shape)
		section.content = updated
	}

	function deleteMeasure(measureIndex?: number) {
		const idx = measureIndex ?? selectedMeasureIndex.value
		if (idx === null || selectedSectionIndex.value === null || !document.value) return

		const section = document.value.sections[selectedSectionIndex.value]
		if (!section || section.content.kind !== 'grid') return

		const grid = section.content as GridSection
		const measures = grid.measures && grid.measures.length > 0
			? [...grid.measures]
			: extractMeasuresFromGrid(grid)

		// Prevent deletion if only one measure
		if (measures.length <= 1) return

		// Prevent deletion if has lyrics
		const measure = measures[idx]
		if (measure?.lyricsHint && measure.lyricsHint.trim() !== '') {
			throw new Error('歌詞が付いている小節は削除できません')
		}

		measures.splice(idx, 1)

		const updated = measuresToGridSection(measures, grid.shape)
		section.content = updated

		// Deselect if deleted
		if (selectedMeasureIndex.value === idx) {
			selectedMeasureIndex.value = null
		}
	}

	function updateMeasureCells(measureIndex: number, cells: GridCell[]) {
		if (selectedSectionIndex.value === null || !document.value) return

		const section = document.value.sections[selectedSectionIndex.value]
		if (!section || section.content.kind !== 'grid') return

		const grid = section.content as GridSection
		const measures = grid.measures && grid.measures.length > 0
			? [...grid.measures]
			: extractMeasuresFromGrid(grid)

		const measure = measures[measureIndex]
		if (!measure) return

		measure.cells = cells.map(c => ({ ...c }))

		const updated = measuresToGridSection(measures, grid.shape)
		section.content = updated
	}

	function swapMeasures(index1: number, index2: number) {
		if (selectedSectionIndex.value === null || !document.value) return

		const section = document.value.sections[selectedSectionIndex.value]
		if (!section || section.content.kind !== 'grid') return

		const grid = section.content as GridSection
		const measures = grid.measures && grid.measures.length > 0
			? [...grid.measures]
			: extractMeasuresFromGrid(grid)

		if (index1 < 0 || index1 >= measures.length) return
		if (index2 < 0 || index2 >= measures.length) return

		// Swap including lyrics hints
		const temp = measures[index1]
		measures[index1] = measures[index2]!
		measures[index2] = temp!

		const updated = measuresToGridSection(measures, grid.shape)
		section.content = updated
	}

	function updateSectionContent(index: number, content: GridSection) {
		if (!document.value || !document.value.sections[index]) return
		document.value.sections[index]!.content = content
	}

	function serialize(): string {
		if (!document.value) return originalContent.value
		return generateChordPro(document.value)
	}

	function markAsSaved() {
		if (document.value) {
			originalContent.value = generateChordPro(document.value)
		}
	}

	return {
		// State
		document,
		selectedSectionIndex,
		selectedMeasureIndex,

		// Getters
		sections,
		gridSections,
		currentSection,
		currentGridSection,
		currentMeasures,
		totalMeasures,
		isDirty,

		// Actions
		loadDocument,
		selectSection,
		selectMeasure,
		addMeasure,
		deleteMeasure,
		updateMeasureCells,
		swapMeasures,
		updateSectionContent,
		serialize,
		markAsSaved
	}
})
