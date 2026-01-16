import { describe, it, expect } from 'vitest'
import type { GridCell } from '@/lib/chordpro/types'
import {
	isBarCell,
	getMeasures,
	getMeasureCellRange,
	addMeasure,
	deleteMeasure,
	copyMeasure,
	swapMeasures,
	reorderCellsInMeasure
} from './useGridOperations'

// Helper to create test cells
function chord(value: string): GridCell {
	return { type: 'chord', value }
}
function bar(): GridCell {
	return { type: 'bar' }
}
function barDouble(): GridCell {
	return { type: 'barDouble' }
}

describe('isBarCell', () => {
	it('returns true for bar types', () => {
		expect(isBarCell({ type: 'bar' })).toBe(true)
		expect(isBarCell({ type: 'barDouble' })).toBe(true)
		expect(isBarCell({ type: 'barEnd' })).toBe(true)
		expect(isBarCell({ type: 'repeatStart' })).toBe(true)
		expect(isBarCell({ type: 'repeatEnd' })).toBe(true)
		expect(isBarCell({ type: 'repeatBoth' })).toBe(true)
	})

	it('returns false for non-bar types', () => {
		expect(isBarCell({ type: 'chord', value: 'C' })).toBe(false)
		expect(isBarCell({ type: 'empty' })).toBe(false)
		expect(isBarCell({ type: 'repeat' })).toBe(false)
	})
})

describe('getMeasures', () => {
	it('extracts measures from cells', () => {
		// || C G | Am F ||
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const measures = getMeasures(cells)

		expect(measures).toHaveLength(2)
		expect(measures[0]!.cells).toHaveLength(2)
		expect(measures[0]!.cells[0]!.value).toBe('C')
		expect(measures[0]!.cells[1]!.value).toBe('G')
		expect(measures[1]!.cells[0]!.value).toBe('Am')
		expect(measures[1]!.cells[1]!.value).toBe('F')
	})

	it('handles single measure', () => {
		// || C G Am F ||
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'), chord('Am'), chord('F'),
			barDouble()
		]

		const measures = getMeasures(cells)
		expect(measures).toHaveLength(1)
		expect(measures[0]!.cells).toHaveLength(4)
	})
})

describe('getMeasureCellRange', () => {
	it('returns correct range for first measure', () => {
		const cells: GridCell[] = [
			barDouble(), // 0
			chord('C'), chord('G'), // 1, 2
			bar(), // 3
			chord('Am'), chord('F'), // 4, 5
			barDouble() // 6
		]

		const range = getMeasureCellRange(cells, 0)
		expect(range).toEqual({ start: 1, end: 2 })
	})

	it('returns correct range for second measure', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const range = getMeasureCellRange(cells, 1)
		expect(range).toEqual({ start: 4, end: 5 })
	})

	it('returns null for invalid index', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'),
			barDouble()
		]

		expect(getMeasureCellRange(cells, 99)).toBeNull()
	})
})

describe('deleteMeasure', () => {
	it('deletes the correct measure (second of two)', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const result = deleteMeasure(cells, 1)
		const measures = getMeasures(result)

		expect(measures).toHaveLength(1)
		expect(measures[0]!.cells[0]!.value).toBe('C')
		expect(measures[0]!.cells[1]!.value).toBe('G')
	})

	it('deletes the correct measure (first of two)', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const result = deleteMeasure(cells, 0)
		const measures = getMeasures(result)

		expect(measures).toHaveLength(1)
		expect(measures[0]!.cells[0]!.value).toBe('Am')
		expect(measures[0]!.cells[1]!.value).toBe('F')
	})

	it('does not delete the last remaining measure', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			barDouble()
		]

		const result = deleteMeasure(cells, 0)
		expect(result).toEqual(cells)
	})
})

describe('addMeasure', () => {
	it('adds measure at end', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			barDouble()
		]

		const result = addMeasure(cells, 'end', 2)
		const measures = getMeasures(result)

		expect(measures).toHaveLength(2)
		expect(measures[0]!.cells[0]!.value).toBe('C')
		expect(measures[1]!.cells[0]!.type).toBe('empty')
	})

	it('adds measure before selected', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const result = addMeasure(cells, { before: 1 }, 2)
		const measures = getMeasures(result)

		expect(measures).toHaveLength(3)
		expect(measures[0]!.cells[0]!.value).toBe('C')
		expect(measures[1]!.cells[0]!.type).toBe('empty')
		expect(measures[2]!.cells[0]!.value).toBe('Am')
	})

	it('adds measure after selected', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const result = addMeasure(cells, { after: 0 }, 2)
		const measures = getMeasures(result)

		expect(measures).toHaveLength(3)
		expect(measures[0]!.cells[0]!.value).toBe('C')
		expect(measures[1]!.cells[0]!.type).toBe('empty')
		expect(measures[2]!.cells[0]!.value).toBe('Am')
	})
})

describe('copyMeasure', () => {
	it('copies measure to the end', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const result = copyMeasure(cells, 0)
		const measures = getMeasures(result)

		expect(measures).toHaveLength(3)
		expect(measures[0]!.cells[0]!.value).toBe('C')
		expect(measures[1]!.cells[0]!.value).toBe('Am')
		expect(measures[2]!.cells[0]!.value).toBe('C') // Copied
		expect(measures[2]!.cells[1]!.value).toBe('G') // Copied
	})
})

describe('swapMeasures', () => {
	it('swaps two adjacent measures', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const result = swapMeasures(cells, 0, 1)
		const measures = getMeasures(result)

		expect(measures).toHaveLength(2)
		expect(measures[0]!.cells[0]!.value).toBe('Am')
		expect(measures[0]!.cells[1]!.value).toBe('F')
		expect(measures[1]!.cells[0]!.value).toBe('C')
		expect(measures[1]!.cells[1]!.value).toBe('G')
	})

	it('handles swapping in reverse order', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const result = swapMeasures(cells, 1, 0)
		const measures = getMeasures(result)

		expect(measures[0]!.cells[0]!.value).toBe('Am')
		expect(measures[1]!.cells[0]!.value).toBe('C')
	})
})

describe('reorderCellsInMeasure', () => {
	it('reorders cells within a measure', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'), chord('Am'), chord('F'),
			barDouble()
		]

		const newOrder = [chord('F'), chord('Am'), chord('G'), chord('C')]
		const result = reorderCellsInMeasure(cells, 0, newOrder)
		const measures = getMeasures(result)

		expect(measures[0]!.cells[0]!.value).toBe('F')
		expect(measures[0]!.cells[1]!.value).toBe('Am')
		expect(measures[0]!.cells[2]!.value).toBe('G')
		expect(measures[0]!.cells[3]!.value).toBe('C')
	})

	it('does not modify other measures', () => {
		const cells: GridCell[] = [
			barDouble(),
			chord('C'), chord('G'),
			bar(),
			chord('Am'), chord('F'),
			barDouble()
		]

		const newOrder = [chord('G'), chord('C')]
		const result = reorderCellsInMeasure(cells, 0, newOrder)
		const measures = getMeasures(result)

		expect(measures[0]!.cells[0]!.value).toBe('G')
		expect(measures[0]!.cells[1]!.value).toBe('C')
		expect(measures[1]!.cells[0]!.value).toBe('Am') // Unchanged
		expect(measures[1]!.cells[1]!.value).toBe('F')  // Unchanged
	})
})
