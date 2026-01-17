import { describe, it, expect } from 'vitest'
import { parseChordProToExtended, ensureGridMeasures } from './parser'
import type { GridSection, ParsedSong } from './types'

describe('parseChordProToExtended', () => {
	it('converts chorded lyrics into grid measures', () => {
		const content = `{title: Test}
{time: 4/4}

{start_of_verse}
[C]Hello [G]world
{end_of_verse}
`

		const parsed = parseChordProToExtended(content)
		const gridSection = parsed.sections.find(section => section.content.kind === 'grid')
		expect(gridSection).toBeTruthy()

		const grid = gridSection!.content as GridSection
		expect(grid.measures?.length).toBe(1)
		expect(grid.measures?.[0]?.lyricsHint).toBe('Hello world')
		expect(grid.measures?.[0]?.cells.map(cell => cell.type)).toEqual(['chord', 'chord'])
	})

	it('assigns row-based lyrics hints to the first measure', () => {
		const content = `{start_of_grid}
|| C . . . | G . . . ||
{lyrics_hint: First line}
{end_of_grid}
`

		const parsed = parseChordProToExtended(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures?.length).toBe(2)
		expect(grid.measures?.[0]?.lyricsHint).toBe('First line')
		expect(grid.measures?.[1]?.lyricsHint).toBeUndefined()
	})

	it('assigns per-measure hints when counts match', () => {
		const content = `{start_of_grid}
|| C . . . | G . . . ||
{lyrics_hint: Line 1}
{lyrics_hint: Line 2}
{end_of_grid}
`

		const parsed = parseChordProToExtended(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures?.length).toBe(2)
		expect(grid.measures?.[0]?.lyricsHint).toBe('Line 1')
		expect(grid.measures?.[1]?.lyricsHint).toBe('Line 2')
	})

	it('builds measures for grid parts', () => {
		const content = `{start_of_grid}
{part: A}
|| C . . . | G . . . ||
{part: B}
|| Am . . . | F . . . ||
{end_of_grid}
`

		const parsed = parseChordProToExtended(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures?.length).toBe(4)
		expect(grid.measures?.[0]?.cells.map(cell => cell.type)).toEqual(['chord', 'empty', 'empty', 'empty'])
	})

	it('maps shorter lyrics hints without crashing', () => {
		const content = `{start_of_grid}
|| C . . . | G . . . | Am . . . ||
{lyrics_hint: First}
{end_of_grid}
`

		const parsed = parseChordProToExtended(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures?.length).toBe(3)
		expect(grid.measures?.[0]?.lyricsHint).toBe('First')
		expect(grid.measures?.[1]?.lyricsHint).toBeUndefined()
	})

	it('does not overwrite existing measures', () => {
		const song: ParsedSong = {
			title: 'Test',
			artist: '',
			sections: [
				{
					type: 'grid',
					content: {
						kind: 'grid',
						measures: [{ cells: [{ type: 'chord', value: 'C' }], lyricsHint: 'keep' }]
					}
				}
			]
		}

		const normalized = ensureGridMeasures(song)
		const grid = normalized.sections[0]!.content as GridSection
		expect(grid.measures?.length).toBe(1)
		expect(grid.measures?.[0]?.lyricsHint).toBe('keep')
	})
})
