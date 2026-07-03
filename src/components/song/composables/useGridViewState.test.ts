import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useGridViewState } from './useGridViewState'
import type { GridSection } from '@/lib/chordpro/types'

const grid: GridSection = {
	kind: 'grid',
	measures: [
		{ cells: [{ type: 'chord', value: 'C' }], lyricsHint: 'Hello' },
		{ cells: [{ type: 'chord', value: 'G' }], lyricsHint: 'World' }
	]
}

describe('useGridViewState', () => {
	it('builds lyrics hints from measures', () => {
		const currentMeasure = ref(0)
		const measureOffset = ref(0)
		const { lyricsHints } = useGridViewState({
			grid,
			currentMeasure,
			measureOffset
		})

		expect(lyricsHints.value[0]).toBe('Hello')
		expect(lyricsHints.value[1]).toBe('World')
	})

	it('marks current measure cells', () => {
		const currentMeasure = ref(1)
		const measureOffset = ref(0)
		const { cellsWithMeasures, currentRowIndex } = useGridViewState({
			grid,
			currentMeasure,
			measureOffset
		})

		expect(cellsWithMeasures.value[0]?.some(cell => cell.isCurrentMeasure)).toBe(true)
		expect(currentRowIndex.value).toBe(0)
	})

	it('applies measure offset to current measure', () => {
		const currentMeasure = ref(2)
		const measureOffset = ref(2)
		const { cellsWithMeasures } = useGridViewState({
			grid,
			currentMeasure,
			measureOffset
		})

		const hasCurrent = cellsWithMeasures.value[0]?.some(cell => cell.isCurrentMeasure)
		expect(hasCurrent).toBe(true)
	})

	it('derives measure indices from array position without bar cells', () => {
		const wideGrid: GridSection = {
			kind: 'grid',
			measures: [
				{ cells: [{ type: 'chord', value: 'C' }, { type: 'empty' }] },
				{ cells: [{ type: 'chord', value: 'G' }] },
				{ cells: [{ type: 'chord', value: 'Am' }] }
			]
		}
		const { cellsWithMeasures } = useGridViewState({
			grid: wideGrid,
			currentMeasure: ref(-1),
			measureOffset: ref(10)
		})

		// 2小節/行 → 行0 = 小節0,1 / 行1 = 小節2
		expect(cellsWithMeasures.value.length).toBe(2)
		expect(cellsWithMeasures.value[0]!.map(cell => cell.measureIndex)).toEqual([10, 10, 11])
		expect(cellsWithMeasures.value[1]!.map(cell => cell.measureIndex)).toEqual([12])
		// Verify no bar cells exist (bars are managed via Measure.startBar/endBar, not cells)
		const cellTypes = cellsWithMeasures.value.flat().map(cell => cell.type)
		expect(cellTypes.every(type => ['chord', 'noChord', 'empty', 'repeat'].includes(type))).toBe(true)
	})
})
