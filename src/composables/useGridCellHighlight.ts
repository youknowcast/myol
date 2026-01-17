import type { GridCell } from '@/lib/chordpro/types'
import { useGridCellDisplay } from './useGridCellDisplay'

export interface KaraokeHighlightOptions {
	currentMeasure: number
	rowStartMeasure: number
	rowEndMeasure: number
}

export function useGridCellHighlight() {
	const { getCellClass: getBaseCellClass } = useGridCellDisplay()

	function isBarCell(cell: GridCell): boolean {
		return [
			'bar',
			'barDouble',
			'barEnd',
			'repeatStart',
			'repeatEnd',
			'repeatBoth'
		].includes(cell.type)
	}

	function getGridViewCellClass(cell: GridCell & { isCurrentMeasure: boolean }): string[] {
		const classes = [...getBaseCellClass(cell)]
		if (cell.isCurrentMeasure && cell.type === 'chord') {
			classes.push('current-measure')
		}
		return classes
	}

	function getKaraokeCellClass(cell: GridCell, options: KaraokeHighlightOptions): string[] {
		const classes = [...getBaseCellClass(cell)]
		const inRange = options.currentMeasure >= options.rowStartMeasure &&
			options.currentMeasure <= options.rowEndMeasure

		if (inRange && !isBarCell(cell)) {
			classes.push('current-measure')
		}
		return classes
	}

	return {
		isBarCell,
		getGridViewCellClass,
		getKaraokeCellClass
	}
}
