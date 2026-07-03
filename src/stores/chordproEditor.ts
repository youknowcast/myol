/**
 * ChordPro Editor Store
 * 編集の唯一の Source of Truth。全ミューテーションはここを経由する。
 * parse/generate は loadDocument / serialize / autoAssign のみで実行される。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
	generateChordPro,
	parseChordProToExtended,
	autoAssignMeasures as applyAutoAssignMeasures
} from '@/lib/chordpro/parser'
import {
	addMeasure as opAddMeasure,
	copyMeasure as opCopyMeasure,
	deleteMeasure as opDeleteMeasure,
	clearLyrics as opClearLyrics,
	clearChords as opClearChords,
	swapMeasure as opSwapMeasure,
	mergeLyrics as opMergeLyrics,
	reorderCells as opReorderCells,
	moveCellWithinGrid,
	moveCellAcrossGrids,
	moveMeasureAcrossGrids,
	setLyricsHint as opSetLyricsHint
} from '@/lib/chordpro/measureOps'
import type { ParsedSong, GridSection, Measure } from '@/lib/chordpro/types'

export interface MoveCellActionPayload {
	fromSectionIndex: number
	toSectionIndex: number
	fromMeasureIndex: number
	toMeasureIndex: number
	sourceCellIndex: number
	newIndex: number | null
}

export interface SongMetadataInput {
	title: string
	artist: string
	key?: string
	capo?: number
	tempo?: number
	time?: string
}

export const useChordProEditorStore = defineStore('chordproEditor', () => {
	// State
	const document = ref<ParsedSong | null>(null)

	// Getters
	const sections = computed(() => document.value?.sections ?? [])

	const gridSections = computed(() =>
		sections.value
			.map((section, index) => ({ section, index }))
			.filter(({ section }) => section.content.kind === 'grid')
	)

	// Internal helpers
	function gridAt(sectionIndex: number): GridSection | null {
		const section = document.value?.sections[sectionIndex]
		if (!section || section.content.kind !== 'grid') return null
		return section.content as GridSection
	}

	function setGridMeasures(sectionIndex: number, measures: Measure[]) {
		const grid = gridAt(sectionIndex)
		if (!grid || !document.value) return
		document.value.sections[sectionIndex]!.content = { ...grid, measures }
	}

	// Document actions
	function loadDocument(content: string) {
		document.value = parseChordProToExtended(content)
	}

	function serialize(): string {
		if (!document.value) return ''
		return generateChordPro(document.value)
	}

	function updateMetadata(meta: SongMetadataInput) {
		if (!document.value) return
		document.value.title = meta.title
		document.value.artist = meta.artist
		document.value.key = meta.key || undefined
		document.value.capo = Number.isFinite(meta.capo) ? meta.capo : undefined
		document.value.tempo = Number.isFinite(meta.tempo) ? meta.tempo : undefined
		document.value.time = meta.time || undefined
	}

	function autoAssign(beatsPerMeasure: number) {
		if (!document.value) return
		document.value = applyAutoAssignMeasures(document.value, beatsPerMeasure)
	}

	// Section actions
	function updateSectionLabel(index: number, label: string | undefined) {
		if (!document.value || !document.value.sections[index]) return
		document.value.sections[index]!.label = label
	}

	function addGridSection(afterIndex?: number, label?: string) {
		if (!document.value) return
		const newSection = {
			type: 'grid' as const,
			label,
			content: {
				kind: 'grid' as const,
				measures: [{ cells: [{ type: 'empty' as const }] }]
			}
		}
		const insertIndex = afterIndex !== undefined ? afterIndex + 1 : document.value.sections.length
		document.value.sections.splice(insertIndex, 0, newSection)
	}

	function removeSection(index: number) {
		if (!document.value) return
		if (index < 0 || index >= document.value.sections.length) return
		document.value.sections.splice(index, 1)
	}

	function moveSection(index: number, direction: 'up' | 'down') {
		if (!document.value) return
		const targetIndex = direction === 'up' ? index - 1 : index + 1
		if (targetIndex < 0 || targetIndex >= document.value.sections.length) return
		const list = document.value.sections
		const temp = list[index]
		list[index] = list[targetIndex]!
		list[targetIndex] = temp!
	}

	function splitGridSection(index: number, measureIndex: number, label?: string) {
		if (!document.value) return
		const grid = gridAt(index)
		if (!grid) return
		if (measureIndex < 0 || measureIndex >= grid.measures.length - 1) return

		const leftMeasures = grid.measures.slice(0, measureIndex + 1)
		const rightMeasures = grid.measures.slice(measureIndex + 1)

		document.value.sections[index]!.content = { ...grid, measures: leftMeasures }
		document.value.sections.splice(index + 1, 0, {
			type: 'grid' as const,
			label,
			content: { kind: 'grid' as const, shape: grid.shape, measures: rightMeasures }
		})
	}

	// Measure actions（不正インデックスは no-op）
	function addMeasure(sectionIndex: number, position: 'end' | 'before' | 'after', anchorIndex: number | null) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opAddMeasure(grid.measures, position, anchorIndex))
	}

	function copyMeasure(sectionIndex: number, measureIndex: number) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opCopyMeasure(grid.measures, measureIndex))
	}

	function deleteMeasure(sectionIndex: number, measureIndex: number) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opDeleteMeasure(grid.measures, measureIndex))
	}

	function clearLyrics(sectionIndex: number, measureIndex: number) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opClearLyrics(grid.measures, measureIndex))
	}

	function setLyricsHint(sectionIndex: number, measureIndex: number, lyricsHint: string) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opSetLyricsHint(grid.measures, measureIndex, lyricsHint))
	}

	function clearChords(sectionIndex: number, measureIndex: number) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opClearChords(grid.measures, measureIndex))
	}

	function swapMeasure(sectionIndex: number, measureIndex: number, direction: 'left' | 'right') {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opSwapMeasure(grid.measures, measureIndex, direction))
	}

	function mergeLyrics(sectionIndex: number, sourceIndex: number, direction: 'left' | 'right') {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opMergeLyrics(grid.measures, sourceIndex, direction))
	}

	function reorderCells(sectionIndex: number, measureIndex: number, newOrder: number[]) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opReorderCells(grid.measures, measureIndex, newOrder))
	}

	function moveCell(payload: MoveCellActionPayload) {
		if (payload.fromSectionIndex === payload.toSectionIndex) {
			const grid = gridAt(payload.fromSectionIndex)
			if (!grid) return
			setGridMeasures(payload.fromSectionIndex, moveCellWithinGrid(grid.measures, payload))
			return
		}
		const fromGrid = gridAt(payload.fromSectionIndex)
		const toGrid = gridAt(payload.toSectionIndex)
		if (!fromGrid || !toGrid) return
		const result = moveCellAcrossGrids(fromGrid.measures, toGrid.measures, payload)
		if (!result) return
		setGridMeasures(payload.fromSectionIndex, result.from)
		setGridMeasures(payload.toSectionIndex, result.to)
	}

	function moveMeasureAcrossSections(fromSectionIndex: number, toSectionIndex: number, fromMeasureIndex: number) {
		if (fromSectionIndex === toSectionIndex) return
		const fromGrid = gridAt(fromSectionIndex)
		const toGrid = gridAt(toSectionIndex)
		if (!fromGrid || !toGrid) return
		const insertAtStart = toSectionIndex > fromSectionIndex
		const result = moveMeasureAcrossGrids(fromGrid.measures, toGrid.measures, fromMeasureIndex, insertAtStart)
		if (!result) return
		setGridMeasures(fromSectionIndex, result.from)
		setGridMeasures(toSectionIndex, result.to)
	}

	return {
		// State
		document,
		// Getters
		sections,
		gridSections,
		// Document
		loadDocument,
		serialize,
		updateMetadata,
		autoAssign,
		// Sections
		updateSectionLabel,
		addGridSection,
		removeSection,
		moveSection,
		splitGridSection,
		// Measures
		addMeasure,
		copyMeasure,
		deleteMeasure,
		clearLyrics,
		setLyricsHint,
		clearChords,
		swapMeasure,
		mergeLyrics,
		reorderCells,
		moveCell,
		moveMeasureAcrossSections
	}
})
