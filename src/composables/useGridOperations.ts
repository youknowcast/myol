/**
 * Grid Operations Composable
 * Pure functions for manipulating grid cells and measures
 */

import type { GridCell, GridRow } from '@/lib/chordpro/types'

// Bar line types for checking measure boundaries
const BAR_TYPES = ['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth'] as const

/**
 * Check if a cell is a bar line
 */
export function isBarCell(cell: GridCell): boolean {
	return BAR_TYPES.includes(cell.type as typeof BAR_TYPES[number])
}

/**
 * Measure representation with cell indices
 */
export interface Measure {
	cells: GridCell[]
	startIndex: number
	endIndex: number
}

/**
 * Cell range in the flat array
 */
export interface CellRange {
	start: number
	end: number
}

/**
 * Extract measures from a flat array of cells
 * Measures are separated by bar lines
 */
export function getMeasures(cells: GridCell[]): Measure[] {
	const measures: Measure[] = []
	let currentMeasureCells: GridCell[] = []
	let startIndex = 0

	cells.forEach((cell, index) => {
		if (isBarCell(cell)) {
			// Only push non-empty measures
			if (currentMeasureCells.length > 0) {
				measures.push({
					cells: currentMeasureCells,
					startIndex,
					endIndex: index - 1
				})
			}
			currentMeasureCells = []
			startIndex = index + 1
		} else {
			currentMeasureCells.push(cell)
		}
	})

	// Add remaining cells as final measure (should not happen in well-formed grids)
	if (currentMeasureCells.length > 0) {
		measures.push({
			cells: currentMeasureCells,
			startIndex,
			endIndex: cells.length - 1
		})
	}

	return measures
}

/**
 * Get the cell range for a specific measure index
 */
export function getMeasureCellRange(cells: GridCell[], measureIndex: number): CellRange | null {
	const measures = getMeasures(cells)
	const measure = measures[measureIndex]
	if (!measure) return null
	return { start: measure.startIndex, end: measure.endIndex }
}

/**
 * Create empty measure cells
 */
export function createEmptyMeasure(beatsPerMeasure: number): GridCell[] {
	const cells: GridCell[] = []
	for (let i = 0; i < beatsPerMeasure; i++) {
		cells.push({ type: 'empty' })
	}
	return cells
}

/**
 * Add a new measure at the specified position
 * @param cells - Current flat array of cells
 * @param position - 'end' or a measure index (insert before that measure)
 * @param beatsPerMeasure - Number of beats per measure
 */
export function addMeasure(
	cells: GridCell[],
	position: 'end' | { before: number } | { after: number },
	beatsPerMeasure: number
): GridCell[] {
	const newMeasureCells = createEmptyMeasure(beatsPerMeasure)

	if (position === 'end') {
		// Find the last bar (should be barDouble at end) and insert before it
		// Structure: || content | content ||
		// We want to insert before the final ||
		const lastBarIndex = cells.length - 1
		if (lastBarIndex < 0) {
			// Empty grid, create new structure
			return [
				{ type: 'barDouble' },
				...newMeasureCells,
				{ type: 'barDouble' }
			]
		}
		return [
			...cells.slice(0, lastBarIndex),
			{ type: 'bar' },
			...newMeasureCells,
			...cells.slice(lastBarIndex)
		]
	}

	if ('before' in position) {
		const measureIndex = position.before
		const range = getMeasureCellRange(cells, measureIndex)
		if (!range) return cells

		// Insert before the measure's start
		// We need to insert: [bar] + [new cells]
		// But we need to be careful about the leading bar
		const insertIndex = range.start
		return [
			...cells.slice(0, insertIndex),
			...newMeasureCells,
			{ type: 'bar' },
			...cells.slice(insertIndex)
		]
	}

	if ('after' in position) {
		const measureIndex = position.after
		const measures = getMeasures(cells)
		if (measureIndex >= measures.length || measureIndex < 0) return cells

		const measure = measures[measureIndex]!
		// Insert after the measure's end + any following bar
		let insertIndex = measure.endIndex + 1

		// Skip the bar that follows this measure
		if (insertIndex < cells.length && isBarCell(cells[insertIndex]!)) {
			insertIndex++
		}

		return [
			...cells.slice(0, insertIndex),
			...newMeasureCells,
			{ type: 'bar' },
			...cells.slice(insertIndex)
		]
	}

	return cells
}

/**
 * Delete a measure at the specified index
 */
export function deleteMeasure(cells: GridCell[], measureIndex: number): GridCell[] {
	const measures = getMeasures(cells)
	if (measures.length <= 1) return cells // Don't delete last measure
	if (measureIndex < 0 || measureIndex >= measures.length) return cells

	const measure = measures[measureIndex]!

	// Determine start and end indices to remove
	let removeStart = measure.startIndex
	let removeEnd = measure.endIndex

	// Also remove the preceding bar if this is not the first measure
	if (measureIndex > 0 && removeStart > 0) {
		const precedingCell = cells[removeStart - 1]
		if (precedingCell && isBarCell(precedingCell)) {
			removeStart--
		}
	} else if (measureIndex === 0) {
		// For first measure, remove the following bar instead
		const followingCell = cells[removeEnd + 1]
		if (followingCell && isBarCell(followingCell)) {
			removeEnd++
		}
	}

	return [
		...cells.slice(0, removeStart),
		...cells.slice(removeEnd + 1)
	]
}

/**
 * Copy a measure and append to the end
 */
export function copyMeasure(cells: GridCell[], measureIndex: number): GridCell[] {
	const measures = getMeasures(cells)
	if (measureIndex < 0 || measureIndex >= measures.length) return cells

	const measure = measures[measureIndex]!
	const copiedCells = measure.cells.map(c => ({ ...c }))

	// Insert at the end (before final barDouble)
	const lastBarIndex = cells.length - 1
	if (lastBarIndex < 0) return cells

	return [
		...cells.slice(0, lastBarIndex),
		{ type: 'bar' },
		...copiedCells,
		...cells.slice(lastBarIndex)
	]
}

/**
 * Swap two measures
 */
export function swapMeasures(cells: GridCell[], index1: number, index2: number): GridCell[] {
	const measures = getMeasures(cells)
	if (index1 < 0 || index1 >= measures.length) return cells
	if (index2 < 0 || index2 >= measures.length) return cells
	if (index1 === index2) return cells

	// Ensure index1 < index2 for simpler logic
	const [smallerIdx, largerIdx] = index1 < index2 ? [index1, index2] : [index2, index1]

	const smallerMeasure = measures[smallerIdx]!
	const largerMeasure = measures[largerIdx]!

	// Create the swapped result
	// We need to replace each measure's cells while keeping bars in place
	const result = [...cells]

	// Copy larger measure cells to smaller position
	const smallerCells = [...smallerMeasure.cells]
	const largerCells = [...largerMeasure.cells]

	// Replace at smaller position
	result.splice(
		smallerMeasure.startIndex,
		smallerCells.length,
		...largerCells.map(c => ({ ...c }))
	)

	// Calculate adjusted indices after first splice
	const sizeDiff = largerCells.length - smallerCells.length
	const adjustedLargerStart = largerMeasure.startIndex + sizeDiff

	// Replace at larger position
	result.splice(
		adjustedLargerStart,
		largerCells.length,
		...smallerCells.map(c => ({ ...c }))
	)

	return result
}

/**
 * Reorder cells within a measure based on new ordering
 * Used for drag & drop within a measure
 */
export function reorderCellsInMeasure(
	cells: GridCell[],
	measureIndex: number,
	newCellOrder: GridCell[]
): GridCell[] {
	const range = getMeasureCellRange(cells, measureIndex)
	if (!range) return cells

	// Verify the count matches
	const oldCount = range.end - range.start + 1
	if (newCellOrder.length !== oldCount) {
		console.warn('Cell count mismatch in reorder', { oldCount, newCount: newCellOrder.length })
		return cells
	}

	return [
		...cells.slice(0, range.start),
		...newCellOrder.map(c => ({ ...c })),
		...cells.slice(range.end + 1)
	]
}

/**
 * Flatten GridRows to a single array of cells
 */
export function flattenRows(rows: GridRow[]): GridCell[] {
	const cells: GridCell[] = []
	rows.forEach(row => {
		row.cells.forEach(cell => {
			cells.push({ ...cell })
		})
	})
	return cells
}

/**
 * Convert flat cells back to a single row
 */
export function cellsToRows(cells: GridCell[]): GridRow[] {
	return [{ cells }]
}
