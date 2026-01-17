import { describe, it, expect } from 'vitest'
import { useGridMeasureHints } from './useGridMeasureHints'
import type { GridSection } from '@/lib/chordpro/types'

describe('useGridMeasureHints', () => {
	it('returns empty when measures missing', () => {
		const grid: GridSection = { kind: 'grid', rows: [] }
		const { getGridMeasureHints } = useGridMeasureHints()

		expect(getGridMeasureHints(grid)).toEqual([])
	})

	it('maps hints from measures', () => {
		const grid: GridSection = {
			kind: 'grid',
			rows: [],
			measures: [
				{ cells: [{ type: 'chord', value: 'C' }], lyricsHint: 'Hello' },
				{ cells: [{ type: 'chord', value: 'G' }] }
			]
		}
		const { getGridMeasureHints } = useGridMeasureHints()

		expect(getGridMeasureHints(grid)).toEqual(['Hello', ''])
	})
})
