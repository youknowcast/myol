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
	it('builds row hints from measures', () => {
		const currentMeasure = ref(0)
		const measureOffset = ref(0)
		const { rowHints } = useGridViewState({
			grid,
			currentMeasure,
			measureOffset
		})


		expect(rowHints.value[0]).toBe('Hello World')
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
})
