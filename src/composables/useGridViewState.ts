import { computed, type ComputedRef, type Ref } from 'vue'
import { gridRowsFromMeasures } from '@/lib/chordpro/parser'
import type { GridSection } from '@/lib/chordpro/types'

export interface CellWithMeasure {
	type: string
	value?: string
	measureIndex: number
	isCurrentMeasure: boolean
}

export interface UseGridViewStateOptions {
	grid: GridSection
	currentMeasure: Ref<number>
	measureOffset: Ref<number>
}

export function useGridViewState(options: UseGridViewStateOptions) {
	const measuresPerRow = 2

	const rowHints = computed(() => {
		if (options.grid.measures.length === 0) {
			return []
		}

		const hints: string[] = []
		for (let index = 0; index < options.grid.measures.length; index += measuresPerRow) {
			const rowHint = options.grid.measures
				.slice(index, index + measuresPerRow)
				.map(measure => measure.lyricsHint)
				.filter((hint): hint is string => Boolean(hint && hint.trim()))
				.join(' ')
			hints.push(rowHint)
		}

		return hints
	})

	const cellsWithMeasures: ComputedRef<CellWithMeasure[][]> = computed(() => {
		let measureIndex = 0
		let hasSeenFirstBar = false
		let hasSeenNonBarSinceLastBar = false
		const result: CellWithMeasure[][] = []
		const rows = gridRowsFromMeasures(options.grid.measures, measuresPerRow)

		for (const row of rows) {
			const rowCells: CellWithMeasure[] = []

			for (const cell of row.cells) {
				const isBar = cell.type === 'bar' || cell.type === 'barDouble' ||
					cell.type === 'barEnd' || cell.type === 'repeatStart' ||
					cell.type === 'repeatEnd' || cell.type === 'repeatBoth'

				if (isBar) {
					if (hasSeenFirstBar && hasSeenNonBarSinceLastBar) {
						measureIndex++
					}
					hasSeenFirstBar = true
					hasSeenNonBarSinceLastBar = false
				} else {
					hasSeenNonBarSinceLastBar = true
				}

				const currentIndex = measureIndex + options.measureOffset.value
				rowCells.push({
					type: cell.type,
					value: cell.value,
					measureIndex: currentIndex,
					isCurrentMeasure: currentIndex === options.currentMeasure.value
				})
			}
			result.push(rowCells)
		}

		return result
	})

	const currentRowIndex = computed(() => {
		for (let rowIdx = 0; rowIdx < cellsWithMeasures.value.length; rowIdx += 1) {
			const row = cellsWithMeasures.value[rowIdx]
			if (row?.some(cell => cell.isCurrentMeasure)) {
				return rowIdx
			}
		}
		return 0
	})

	return {
		rowHints,
		cellsWithMeasures,
		currentRowIndex
	}
}
