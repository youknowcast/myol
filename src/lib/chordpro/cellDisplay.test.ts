import { describe, it, expect } from 'vitest'
import { cellGlyph, cellKind, boundaryGlyph, gridBarGlyphs, gridCellClasses } from './cellDisplay'
import type { Measure } from './types'

describe('cellGlyph / cellKind', () => {
	it('maps cell types to glyphs', () => {
		expect(cellGlyph({ type: 'chord', value: 'G' })).toBe('G')
		expect(cellGlyph({ type: 'noChord' })).toBe('/')
		expect(cellGlyph({ type: 'empty' })).toBe('·')
		expect(cellGlyph({ type: 'repeat', value: '%' })).toBe('%')
	})

	it('maps cell types to kinds', () => {
		expect(cellKind({ type: 'chord', value: 'G' })).toBe('chord')
		expect(cellKind({ type: 'noChord' })).toBe('empty')
		expect(cellKind({ type: 'empty' })).toBe('empty')
		expect(cellKind({ type: 'repeat', value: '%' })).toBe('repeat')
	})
})

describe('boundaryGlyph / gridBarGlyphs', () => {
	it('renders repeat and end bars distinctly', () => {
		expect(boundaryGlyph(undefined, undefined, '│')).toBe('│')
		expect(boundaryGlyph('repeatEnd', undefined, '│')).toBe(':║')
		expect(boundaryGlyph(undefined, 'repeatStart', '║')).toBe('║:')
		expect(boundaryGlyph('repeatEnd', 'repeatStart', '│')).toBe(':║:')
		expect(boundaryGlyph('barEnd', undefined, '║')).toBe('║.')
		expect(boundaryGlyph('barEnd', 'repeatStart', '│')).toBe('║. ║:')
	})

	it('builds a glyph per boundary for a measure list', () => {
		const measures: Measure[] = [
			{ cells: [{ type: 'chord', value: 'G' }], startBar: 'repeatStart' },
			{ cells: [{ type: 'chord', value: 'C' }] },
			{ cells: [{ type: 'chord', value: 'D' }], endBar: 'repeatEnd' }
		]
		expect(gridBarGlyphs(measures)).toEqual(['║:', '│', '│', ':║'])
	})

	it('returns the outer bars for an empty list', () => {
		expect(gridBarGlyphs([])).toEqual(['║'])
	})
})

describe('gridCellClasses', () => {
	it('marks only chord cells as current', () => {
		expect(gridCellClasses({ type: 'chord', value: 'G' }, true)).toEqual(['grid-chord', 'current-measure'])
		expect(gridCellClasses({ type: 'empty' }, true)).toEqual(['grid-empty'])
		expect(gridCellClasses({ type: 'chord', value: 'G' }, false)).toEqual(['grid-chord'])
	})
})
