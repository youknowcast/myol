import { describe, it, expect } from 'vitest'
import {
	addMeasure,
	copyMeasure,
	deleteMeasure,
	clearLyrics,
	clearChords,
	swapMeasure,
	mergeLyrics,
	reorderCells,
	moveCellWithinGrid,
	moveCellAcrossGrids,
	moveMeasureAcrossGrids,
	setLyricsHint
} from './measureOps'
import type { Measure } from './types'

function sample(): Measure[] {
	return [
		{
			cells: [{ type: 'chord', value: 'G' }, { type: 'empty' }],
			lyricsHint: 'one',
			startBar: 'repeatStart'
		},
		{
			cells: [{ type: 'chord', value: 'C' }, { type: 'empty' }],
			lyricsHint: 'two'
		},
		{
			cells: [{ type: 'chord', value: 'D' }],
			endBar: 'repeatEnd'
		}
	]
}

describe('addMeasure', () => {
	it('appends an empty measure at end without touching bars', () => {
		const next = addMeasure(sample(), 'end', null)
		expect(next.length).toBe(4)
		expect(next[3]!.cells).toEqual([{ type: 'empty' }])
		expect(next[0]!.startBar).toBe('repeatStart')
		expect(next[2]!.endBar).toBe('repeatEnd')
	})

	it('inserts before/after the anchor', () => {
		expect(addMeasure(sample(), 'before', 1)[1]!.cells).toEqual([{ type: 'empty' }])
		expect(addMeasure(sample(), 'after', 1)[2]!.cells).toEqual([{ type: 'empty' }])
	})

	it('is a no-op clone when anchor is null or out of range', () => {
		expect(addMeasure(sample(), 'after', null)).toEqual(sample())
		expect(addMeasure(sample(), 'after', 99)).toEqual(sample())
	})
})

describe('copyMeasure / deleteMeasure', () => {
	it('duplicates the measure including bars and hint', () => {
		const next = copyMeasure(sample(), 0)
		expect(next.length).toBe(4)
		expect(next[1]).toEqual(sample()[0])
	})

	it('deletes a measure with lyrics (allowed by spec)', () => {
		const next = deleteMeasure(sample(), 1)
		expect(next.length).toBe(2)
		expect(next.map(m => m.lyricsHint)).toEqual(['one', undefined])
	})

	it('refuses to delete the last measure', () => {
		const single: Measure[] = [{ cells: [{ type: 'chord', value: 'G' }] }]
		expect(deleteMeasure(single, 0)).toEqual(single)
	})
})

describe('clearLyrics / clearChords / swapMeasure / mergeLyrics', () => {
	it('clears only lyrics, keeping cells and bars', () => {
		const next = clearLyrics(sample(), 0)
		expect(next[0]!.lyricsHint).toBeUndefined()
		expect(next[0]!.startBar).toBe('repeatStart')
	})

	it('replaces cells with empties of same length', () => {
		const next = clearChords(sample(), 0)
		expect(next[0]!.cells).toEqual([{ type: 'empty' }, { type: 'empty' }])
		expect(next[0]!.lyricsHint).toBe('one')
	})

	it('swaps neighbours and is a no-op at the edge', () => {
		const next = swapMeasure(sample(), 0, 'right')
		expect(next[0]!.lyricsHint).toBe('two')
		expect(next[1]!.lyricsHint).toBe('one')
		expect(swapMeasure(sample(), 0, 'left')).toEqual(sample())
	})

	it('merges lyrics into the neighbour and clears the source', () => {
		const next = mergeLyrics(sample(), 1, 'left')
		expect(next[0]!.lyricsHint).toBe('one two')
		expect(next[1]!.lyricsHint).toBeUndefined()
	})
})

describe('setLyricsHint', () => {
	it('sets, replaces and clears the hint, preserving bars', () => {
		const withHint = setLyricsHint(sample(), 2, ' new words ')
		expect(withHint[2]!.lyricsHint).toBe('new words')
		expect(withHint[2]!.endBar).toBe('repeatEnd')
		const cleared = setLyricsHint(withHint, 2, '   ')
		expect(cleared[2]!.lyricsHint).toBeUndefined()
	})

	it('is a no-op clone for invalid index', () => {
		expect(setLyricsHint(sample(), 99, 'x')).toEqual(sample())
	})
})

describe('reorderCells', () => {
	it('applies a permutation', () => {
		const next = reorderCells(sample(), 0, [1, 0])
		expect(next[0]!.cells.map(c => c.type)).toEqual(['empty', 'chord'])
	})

	it('rejects non-permutations', () => {
		expect(reorderCells(sample(), 0, [0, 0])).toEqual(sample())
		expect(reorderCells(sample(), 0, [0])).toEqual(sample())
		expect(reorderCells(sample(), 0, [0, 5])).toEqual(sample())
	})
})

describe('cell/measure moves', () => {
	it('moves a chord into the target empty slot within a grid', () => {
		const next = moveCellWithinGrid(sample(), {
			fromMeasureIndex: 0,
			toMeasureIndex: 1,
			sourceCellIndex: 0,
			newIndex: 1
		})
		expect(next[0]!.cells).toEqual([{ type: 'empty' }])
		expect(next[1]!.cells).toEqual([{ type: 'chord', value: 'C' }, { type: 'chord', value: 'G' }])
		expect(next[0]!.startBar).toBe('repeatStart')
	})

	it('refuses to move an empty cell', () => {
		const next = moveCellWithinGrid(sample(), {
			fromMeasureIndex: 0,
			toMeasureIndex: 1,
			sourceCellIndex: 1,
			newIndex: 0
		})
		expect(next).toEqual(sample())
	})

	it('moves a cell across grids, refilling an emptied source measure', () => {
		const from: Measure[] = [{ cells: [{ type: 'chord', value: 'Am' }], lyricsHint: 'solo' }]
		const to = sample()
		const result = moveCellAcrossGrids(from, to, {
			fromMeasureIndex: 0,
			toMeasureIndex: 2,
			sourceCellIndex: 0,
			newIndex: 0
		})
		expect(result).not.toBeNull()
		expect(result!.from[0]!.cells).toEqual([{ type: 'empty' }])
		expect(result!.from[0]!.lyricsHint).toBe('solo')
		expect(result!.to[2]!.cells.map(c => c.value)).toEqual(['Am', 'D'])
		expect(result!.to[2]!.endBar).toBe('repeatEnd')
	})

	it('moves a measure across grids preserving bars, refilling the source', () => {
		const from: Measure[] = [{ cells: [{ type: 'chord', value: 'Am' }], startBar: 'repeatStart' }]
		const to = sample()
		const result = moveMeasureAcrossGrids(from, to, 0, true)
		expect(result!.from[0]!.cells).toEqual([{ type: 'empty' }])
		expect(result!.to.length).toBe(4)
		expect(result!.to[0]!.startBar).toBe('repeatStart')
		expect(result!.to[0]!.cells[0]!.value).toBe('Am')
	})

	it('does not mutate its inputs', () => {
		const input = sample()
		moveCellWithinGrid(input, { fromMeasureIndex: 0, toMeasureIndex: 1, sourceCellIndex: 0, newIndex: 0 })
		expect(input).toEqual(sample())
	})
})
