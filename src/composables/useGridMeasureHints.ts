import type { GridSection } from '@/lib/chordpro/types'

export function useGridMeasureHints() {
	function getGridMeasureHints(grid: GridSection): string[] {
		if (!grid.measures || grid.measures.length === 0) {
			return []
		}
		return grid.measures.map(measure => measure.lyricsHint ?? '')
	}

	return {
		getGridMeasureHints
	}
}
