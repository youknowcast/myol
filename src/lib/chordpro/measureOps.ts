import type { GridCell, Measure } from './types'

export interface MoveCellWithinGridPayload {
	fromMeasureIndex: number
	toMeasureIndex: number
	sourceCellIndex: number
	newIndex: number | null
}

export function cloneMeasures(measures: Measure[]): Measure[] {
	return measures.map(measure => ({
		...measure,
		cells: measure.cells.map(cell => ({ ...cell }))
	}))
}

export function createEmptyMeasure(): Measure {
	return { cells: [{ type: 'empty' }] }
}

export function addMeasure(
	measures: Measure[],
	position: 'end' | 'before' | 'after',
	anchorIndex: number | null
): Measure[] {
	const next = cloneMeasures(measures)
	if (position === 'end') {
		next.push(createEmptyMeasure())
		return next
	}
	if (anchorIndex === null || anchorIndex < 0 || anchorIndex >= measures.length) return next
	const insertIndex = position === 'before' ? anchorIndex : anchorIndex + 1
	next.splice(insertIndex, 0, createEmptyMeasure())
	return next
}

export function copyMeasure(measures: Measure[], measureIndex: number): Measure[] {
	const next = cloneMeasures(measures)
	const original = next[measureIndex]
	if (!original) return next
	next.splice(measureIndex + 1, 0, {
		...original,
		cells: original.cells.map(cell => ({ ...cell }))
	})
	return next
}

export function deleteMeasure(measures: Measure[], measureIndex: number): Measure[] {
	const next = cloneMeasures(measures)
	if (measures.length <= 1) return next
	if (measureIndex < 0 || measureIndex >= next.length) return next
	next.splice(measureIndex, 1)
	return next
}

export function clearLyrics(measures: Measure[], measureIndex: number): Measure[] {
	const next = cloneMeasures(measures)
	const target = next[measureIndex]
	if (!target) return next
	next[measureIndex] = { ...target, lyricsHint: undefined }
	return next
}

export function setLyricsHint(
	measures: Measure[],
	measureIndex: number,
	lyricsHint: string
): Measure[] {
	const next = cloneMeasures(measures)
	const target = next[measureIndex]
	if (!target) return next
	const trimmed = lyricsHint.trim()
	next[measureIndex] = { ...target, lyricsHint: trimmed ? trimmed : undefined }
	return next
}

export function clearChords(measures: Measure[], measureIndex: number): Measure[] {
	const next = cloneMeasures(measures)
	const target = next[measureIndex]
	if (!target) return next
	const clearedCells: GridCell[] = target.cells.length > 0
		? target.cells.map(() => ({ type: 'empty' as const }))
		: [{ type: 'empty' as const }]
	next[measureIndex] = { ...target, cells: clearedCells }
	return next
}

export function swapMeasure(
	measures: Measure[],
	measureIndex: number,
	direction: 'left' | 'right'
): Measure[] {
	const targetIndex = direction === 'left' ? measureIndex - 1 : measureIndex + 1
	const next = cloneMeasures(measures)
	if (measureIndex < 0 || measureIndex >= next.length) return next
	if (targetIndex < 0 || targetIndex >= next.length) return next
	const temp = next[measureIndex]!
	next[measureIndex] = next[targetIndex]!
	next[targetIndex] = temp
	return next
}

export function mergeLyrics(
	measures: Measure[],
	sourceIndex: number,
	direction: 'left' | 'right'
): Measure[] {
	const next = cloneMeasures(measures)
	const targetIndex = direction === 'left' ? sourceIndex - 1 : sourceIndex + 1
	if (targetIndex < 0 || targetIndex >= next.length) return next
	const sourceLyrics = next[sourceIndex]?.lyricsHint?.trim()
	if (!sourceLyrics) return next
	const targetLyrics = next[targetIndex]?.lyricsHint?.trim()
	const mergedLyrics = targetLyrics
		? direction === 'left'
			? `${targetLyrics} ${sourceLyrics}`
			: `${sourceLyrics} ${targetLyrics}`
		: sourceLyrics
	next[targetIndex] = { ...next[targetIndex]!, lyricsHint: mergedLyrics }
	next[sourceIndex] = { ...next[sourceIndex]!, lyricsHint: undefined }
	return next
}

export function reorderCells(
	measures: Measure[],
	measureIndex: number,
	newOrder: number[]
): Measure[] {
	const next = cloneMeasures(measures)
	const measure = measures[measureIndex]
	if (!measure) return next
	if (newOrder.length !== measure.cells.length) return next
	const seen = new Set(newOrder)
	if (seen.size !== measure.cells.length) return next
	if (newOrder.some(index => index < 0 || index >= measure.cells.length)) return next
	next[measureIndex] = {
		...next[measureIndex]!,
		cells: newOrder.map(index => ({ ...measure.cells[index]! }))
	}
	return next
}

function extractCell(sourceCells: GridCell[], sourceCellIndex: number): GridCell | null {
	const movedCell = sourceCells[sourceCellIndex]
	if (!movedCell || movedCell.type === 'empty') return null
	sourceCells.splice(sourceCellIndex, 1)
	if (sourceCells.length === 0) {
		sourceCells.push({ type: 'empty' })
	}
	return movedCell
}

function placeCell(targetCells: GridCell[], movedCell: GridCell, newIndex: number | null) {
	const emptyIndices = targetCells
		.map((cell, index) => (cell.type === 'empty' ? index : null))
		.filter((index): index is number => index !== null)

	if (emptyIndices.length > 0) {
		const fallbackIndex = emptyIndices[0] ?? 0
		const replaceIndex = typeof newIndex === 'number'
			? emptyIndices.reduce((closest, index) =>
				(Math.abs(index - newIndex) < Math.abs(closest - newIndex) ? index : closest), fallbackIndex)
			: fallbackIndex
		targetCells.splice(replaceIndex, 1, { ...movedCell })
		return
	}

	let insertIndex = typeof newIndex === 'number' ? newIndex : targetCells.length
	if (insertIndex < 0) insertIndex = 0
	if (insertIndex > targetCells.length) insertIndex = targetCells.length
	targetCells.splice(insertIndex, 0, { ...movedCell })
}

export function moveCellWithinGrid(
	measures: Measure[],
	payload: MoveCellWithinGridPayload
): Measure[] {
	const next = cloneMeasures(measures)
	if (payload.fromMeasureIndex === payload.toMeasureIndex) return next
	const source = measures[payload.fromMeasureIndex]
	const target = measures[payload.toMeasureIndex]
	if (!source || !target) return next
	const sourceCells = source.cells.map(cell => ({ ...cell }))
	const targetCells = target.cells.map(cell => ({ ...cell }))
	const movedCell = extractCell(sourceCells, payload.sourceCellIndex)
	if (!movedCell) return next
	placeCell(targetCells, movedCell, payload.newIndex)
	next[payload.fromMeasureIndex] = { ...next[payload.fromMeasureIndex]!, cells: sourceCells }
	next[payload.toMeasureIndex] = { ...next[payload.toMeasureIndex]!, cells: targetCells }
	return next
}

export function moveCellAcrossGrids(
	fromMeasures: Measure[],
	toMeasures: Measure[],
	payload: MoveCellWithinGridPayload
): { from: Measure[]; to: Measure[] } | null {
	const source = fromMeasures[payload.fromMeasureIndex]
	const target = toMeasures[payload.toMeasureIndex]
	if (!source || !target) return null
	const sourceCells = source.cells.map(cell => ({ ...cell }))
	const targetCells = target.cells.map(cell => ({ ...cell }))
	const movedCell = extractCell(sourceCells, payload.sourceCellIndex)
	if (!movedCell) return null
	placeCell(targetCells, movedCell, payload.newIndex)
	const from = cloneMeasures(fromMeasures)
	from[payload.fromMeasureIndex] = { ...from[payload.fromMeasureIndex]!, cells: sourceCells }
	const to = cloneMeasures(toMeasures)
	to[payload.toMeasureIndex] = { ...to[payload.toMeasureIndex]!, cells: targetCells }
	return { from, to }
}

export function moveMeasureAcrossGrids(
	fromMeasures: Measure[],
	toMeasures: Measure[],
	fromMeasureIndex: number,
	insertAtStart: boolean
): { from: Measure[]; to: Measure[] } | null {
	const movedMeasure = fromMeasures[fromMeasureIndex]
	if (!movedMeasure) return null
	const from = cloneMeasures(fromMeasures)
	from.splice(fromMeasureIndex, 1)
	if (from.length === 0) {
		from.push(createEmptyMeasure())
	}
	const to = cloneMeasures(toMeasures)
	to.splice(insertAtStart ? 0 : to.length, 0, {
		...movedMeasure,
		cells: movedMeasure.cells.map(cell => ({ ...cell }))
	})
	return { from, to }
}
