import { describe, it, expect } from 'vitest'
import { useGridCellDisplay } from './useGridCellDisplay'

describe('useGridCellDisplay', () => {
	it('returns display text for bars', () => {
		const { getCellDisplay } = useGridCellDisplay()
		expect(getCellDisplay({ type: 'bar' })).toBe('│')
		expect(getCellDisplay({ type: 'repeatBoth' })).toBe(':║:')
	})

	it('returns display text for chords', () => {
		const { getCellDisplay } = useGridCellDisplay()
		expect(getCellDisplay({ type: 'chord', value: 'C' })).toBe('C')
	})

	it('returns classes by cell type', () => {
		const { getCellClass } = useGridCellDisplay()
		expect(getCellClass({ type: 'chord' })).toEqual(['grid-chord'])
		expect(getCellClass({ type: 'repeat' })).toEqual(['grid-repeat'])
	})
})
