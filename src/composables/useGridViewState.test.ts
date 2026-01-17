import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useGridViewState } from './useGridViewState'
import type { GridSection } from '@/lib/chordpro/types'

const grid: GridSection = {
	kind: 'grid',
	rows: [
		{ cells: [{ type: 'barDouble' }, { type: 'chord', value: 'C' }, { type: 'bar' }, { type: 'chord', value: 'G' }, { type: 'barDouble' }] }
	],
	measures: [
		{ cells: [{ type: 'chord', value: 'C' }], lyricsHint: 'Hello' },
		{ cells: [{ type: 'chord', value: 'G' }], lyricsHint: 'World' }
	]
}

describe('useGridViewState', () => {
	it('builds row hints from measures', () => {
		const currentMeasure = ref(0)
		const measureOffset = ref(0)
		const isPlaying = ref(false)

		const { rowHints } = useGridViewState({
			grid,
			currentMeasure,
			measureOffset,
			isPlaying
		})

		expect(rowHints.value[0]).toBe('Hello World')
	})

	it('marks current measure cells', () => {
		const currentMeasure = ref(1)
		const measureOffset = ref(0)
		const isPlaying = ref(false)

		const { cellsWithMeasures, currentRowIndex } = useGridViewState({
			grid,
			currentMeasure,
			measureOffset,
			isPlaying
		})

		expect(cellsWithMeasures.value[0]?.some(cell => cell.isCurrentMeasure)).toBe(true)
		expect(currentRowIndex.value).toBe(0)
	})
})
