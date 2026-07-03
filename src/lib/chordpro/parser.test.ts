import { describe, it, expect } from 'vitest'
import { parseChordPro, parseChordProToExtended, ensureGridMeasures } from './parser'
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

	it('parses grid labels without colon', () => {
		const content = `{start_of_grid label="Intro" shape="4x4"}
		|| C . . . | G . . . ||
		{end_of_grid}
		`

		const parsed = parseChordProToExtended(content)
		const section = parsed.sections[0]!
		const grid = section.content as GridSection
		expect(section.label).toBe('Intro')
		expect(grid.shape).toBe('4x4')
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

	it('parses / as a no-chord cell', () => {
		const content = `{start_of_grid}
|| C . / . ||
{end_of_grid}
`

		const parsed = parseChordProToExtended(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures?.[0]?.cells.map(cell => cell.type)).toEqual(['chord', 'empty', 'noChord', 'empty'])
	})
})

describe('measure annotations (new format)', () => {
	it('assigns |-separated hint segments to the measures of the following row', () => {
		const content = `{start_of_grid}
{lyrics_hint: Amazing grace how | sweet the sound}
|| G . . . | C . G . ||
{lyrics_hint: That saved a | wretch like me}
|| G . . . | D . . . ||
{end_of_grid}
`

		const parsed = parseChordPro(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures.length).toBe(4)
		expect(grid.measures[0]!.lyricsHint).toBe('Amazing grace how')
		expect(grid.measures[1]!.lyricsHint).toBe('sweet the sound')
		expect(grid.measures[2]!.lyricsHint).toBe('That saved a')
		expect(grid.measures[3]!.lyricsHint).toBe('wretch like me')
	})

	it('treats empty segments as no hint and ignores extra segments', () => {
		const content = `{start_of_grid}
{lyrics_hint: | sweet | extra | over}
|| G . . . | C . . . ||
{end_of_grid}
`

		const parsed = parseChordPro(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures.length).toBe(2)
		expect(grid.measures[0]!.lyricsHint).toBeUndefined()
		expect(grid.measures[1]!.lyricsHint).toBe('sweet')
	})

	it('keeps trailing hint blocks on the legacy path (per-measure when counts match)', () => {
		const content = `{start_of_grid}
|| C . . . | G . . . ||
{lyrics_hint: Line 1}
{lyrics_hint: Line 2}
{end_of_grid}
`

		const parsed = parseChordPro(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures[0]!.lyricsHint).toBe('Line 1')
		expect(grid.measures[1]!.lyricsHint).toBe('Line 2')
	})

	it('captures repeat bars on measure boundaries', () => {
		const content = `{start_of_grid}
|: G . . . | C . . . :|
{end_of_grid}
`

		const parsed = parseChordPro(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures[0]!.startBar).toBe('repeatStart')
		expect(grid.measures[0]!.endBar).toBeUndefined()
		expect(grid.measures[1]!.endBar).toBe('repeatEnd')
	})

	it('captures repeatBoth and end bars', () => {
		const content = `{start_of_grid}
|| C . . . :|: G . . . |.
{end_of_grid}
`

		const parsed = parseChordPro(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures[0]!.endBar).toBe('repeatEnd')
		expect(grid.measures[1]!.startBar).toBe('repeatStart')
		expect(grid.measures[1]!.endBar).toBe('barEnd')
	})

	it('carries a dangling repeat-start bar to the next grid line', () => {
		const content = `{start_of_grid}
|| G . . . |:
| D . . . :|
{end_of_grid}
`

		const parsed = parseChordPro(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures.length).toBe(2)
		expect(grid.measures[0]!.startBar).toBeUndefined()
		expect(grid.measures[1]!.startBar).toBe('repeatStart')
		expect(grid.measures[1]!.endBar).toBe('repeatEnd')
	})

	it('attaches endBar to the previous measure across consecutive bar tokens', () => {
		const content = `{start_of_grid}
|| G . . . || :|
{end_of_grid}
`

		const parsed = parseChordPro(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures.length).toBe(1)
		expect(grid.measures[0]!.endBar).toBe('repeatEnd')
	})
})
