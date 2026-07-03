import { computed, type ComputedRef, type Ref } from 'vue'
import type { GridCell, GridSection } from '@/lib/chordpro/types'

export interface CellWithMeasure extends GridCell {
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

	const measureHints = computed(() =>
		options.grid.measures.map((measure) => measure.lyricsHint?.trim() ?? '')
	)

	const cellsWithMeasures: ComputedRef<CellWithMeasure[][]> = computed(() => {
		const rows: CellWithMeasure[][] = []
		const measures = options.grid.measures

		for (let start = 0; start < measures.length; start += measuresPerRow) {
			const rowCells: CellWithMeasure[] = []
			measures.slice(start, start + measuresPerRow).forEach((measure, indexInRow) => {
				const globalIndex = start + indexInRow + options.measureOffset.value
				for (const cell of measure.cells) {
					rowCells.push({
						type: cell.type,
						value: cell.value,
						measureIndex: globalIndex,
						isCurrentMeasure: globalIndex === options.currentMeasure.value
					})
				}
			})
			rows.push(rowCells)
		}

		return rows
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
		measureHints,
		cellsWithMeasures,
		currentRowIndex
	}
}
