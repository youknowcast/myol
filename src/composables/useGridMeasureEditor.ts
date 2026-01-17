import { computed, type ComputedRef, type Ref } from 'vue'
import type { GridCell, Measure } from '@/lib/chordpro/types'

export interface EditableMeasure extends Measure {
	cells: ({ id: string } & GridCell)[]
}

export interface UseGridMeasureEditorOptions {
	measures: ComputedRef<Measure[]>
	selectedMeasureIndex: Ref<number | null>
}

function cloneMeasures(measures: Measure[]): Measure[] {
	return measures.map(measure => ({
		cells: measure.cells.map(cell => ({ type: cell.type, value: cell.value })),
		lyricsHint: measure.lyricsHint
	}))
}

function createEmptyMeasure(): Measure {
	return { cells: [{ type: 'empty' }] }
}

export function useGridMeasureEditor(options: UseGridMeasureEditorOptions) {
	const displayMeasures = computed<EditableMeasure[]>(() => {
		return options.measures.value.map((measure, index) => ({
			...measure,
			cells: measure.cells.map((cell, cellIndex) => ({
				id: `${index}-${cellIndex}`,
				...cell
			}))
		}))
	})

	function addMeasure(position: 'end' | 'before' | 'after'): Measure[] {
		const next = cloneMeasures(options.measures.value)

		if (position === 'end') {
			next.push(createEmptyMeasure())
			return next
		}

		if (options.selectedMeasureIndex.value === null) return next

		const insertIndex = position === 'before'
			? options.selectedMeasureIndex.value
			: options.selectedMeasureIndex.value + 1

		next.splice(insertIndex, 0, createEmptyMeasure())
		return next
	}

	function copyMeasure(): Measure[] {
		if (options.selectedMeasureIndex.value === null) return cloneMeasures(options.measures.value)

		const next = cloneMeasures(options.measures.value)
		const original = next[options.selectedMeasureIndex.value]
		if (!original) return next

		next.splice(options.selectedMeasureIndex.value + 1, 0, {
			cells: original.cells.map(cell => ({ ...cell })),
			lyricsHint: original.lyricsHint
		})
		return next
	}

	function deleteMeasure(): Measure[] {
		if (options.selectedMeasureIndex.value === null) return cloneMeasures(options.measures.value)
		if (options.measures.value.length <= 1) return cloneMeasures(options.measures.value)

		const next = cloneMeasures(options.measures.value)
		next.splice(options.selectedMeasureIndex.value, 1)
		options.selectedMeasureIndex.value = null
		return next
	}

	function deleteLyrics(): Measure[] {
		if (options.selectedMeasureIndex.value === null) return cloneMeasures(options.measures.value)
		const next = cloneMeasures(options.measures.value)
		const target = next[options.selectedMeasureIndex.value]
		if (!target) return next
		next[options.selectedMeasureIndex.value] = {
			cells: target.cells.map(cell => ({ ...cell })),
			lyricsHint: undefined
		}
		return next
	}

	function deleteChords(): Measure[] {
		if (options.selectedMeasureIndex.value === null) return cloneMeasures(options.measures.value)
		const next = cloneMeasures(options.measures.value)
		const target = next[options.selectedMeasureIndex.value]
		if (!target) return next
		const clearedCells = target.cells.length > 0
			? target.cells.map(() => ({ type: 'empty' as const }))
			: [{ type: 'empty' as const }]
		next[options.selectedMeasureIndex.value] = {
			cells: clearedCells,
			lyricsHint: target.lyricsHint
		}
		return next
	}

	function swapMeasure(direction: 'left' | 'right'): Measure[] {
		if (options.selectedMeasureIndex.value === null) return cloneMeasures(options.measures.value)

		const targetIdx = direction === 'left'
			? options.selectedMeasureIndex.value - 1
			: options.selectedMeasureIndex.value + 1

		if (targetIdx < 0 || targetIdx >= options.measures.value.length) {
			return cloneMeasures(options.measures.value)
		}

		const next = cloneMeasures(options.measures.value)
		const temp = next[options.selectedMeasureIndex.value]
		next[options.selectedMeasureIndex.value] = next[targetIdx]!
		next[targetIdx] = temp!
		options.selectedMeasureIndex.value = targetIdx
		return next
	}

	function mergeLyrics(direction: 'left' | 'right', sourceIndex?: number): Measure[] {
		const currentIndex = sourceIndex ?? options.selectedMeasureIndex.value
		if (currentIndex === null || currentIndex === undefined) {
			return cloneMeasures(options.measures.value)
		}
		const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1
		if (targetIndex < 0 || targetIndex >= options.measures.value.length) {
			return cloneMeasures(options.measures.value)
		}

		const current = options.measures.value[currentIndex]
		const currentLyrics = current?.lyricsHint?.trim()
		if (!currentLyrics) return cloneMeasures(options.measures.value)

		const next = cloneMeasures(options.measures.value)
		const targetLyrics = next[targetIndex]?.lyricsHint?.trim()
		const mergedLyrics = targetLyrics
			? direction === 'left'
				? `${targetLyrics} ${currentLyrics}`
				: `${currentLyrics} ${targetLyrics}`
			: currentLyrics
		next[targetIndex] = {
			cells: next[targetIndex]?.cells ?? [],
			lyricsHint: mergedLyrics
		}
		next[currentIndex] = {
			cells: next[currentIndex]?.cells ?? [],
			lyricsHint: undefined
		}
		return next
	}

	function reorderCells(measureIndex: number, orderedCellIds: string[]): Measure[] {
		const measure = displayMeasures.value[measureIndex]
		if (!measure) return cloneMeasures(options.measures.value)

		const cellMap = new Map<string, GridCell>()
		measure.cells.forEach(cell => {
			cellMap.set(cell.id, { type: cell.type, value: cell.value })
		})

		const newOrder = orderedCellIds
			.map(id => cellMap.get(id))
			.filter((cell): cell is GridCell => cell !== undefined)

		if (newOrder.length !== measure.cells.length) {
			return cloneMeasures(options.measures.value)
		}

		const next = cloneMeasures(options.measures.value)
		next[measureIndex] = {
			cells: newOrder.map(cell => ({ ...cell })),
			lyricsHint: next[measureIndex]?.lyricsHint
		}
		return next
	}

	return {
		displayMeasures,
		addMeasure,
		copyMeasure,
		deleteMeasure,
		deleteLyrics,
		deleteChords,
		swapMeasure,
		mergeLyrics,
		reorderCells
	}
}
