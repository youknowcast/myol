import { describe, it, expect } from 'vitest'
import { parseChordPro, generateChordPro } from './parser'
import type { GridSection } from './types'

function gridMeasures(content: string) {
	const parsed = parseChordPro(content)
	const grid = parsed.sections.find(section => section.content.kind === 'grid')
	return (grid?.content as GridSection | undefined)?.measures ?? []
}

function roundTrip(content: string): string {
	return generateChordPro(parseChordPro(content))
}

describe('chordpro round-trip', () => {
	it('keeps hints on their measures across save (multi-row regression)', () => {
		// 監査で確認したヒントドリフト: 2行×2小節 + 行ごとヒントが
		// 旧実装では保存のたびに別小節へずれていた
		const content = `{title: Test}

{start_of_grid}
{lyrics_hint: Amazing grace how | sweet the sound}
|| G . . . | C . G . ||
{lyrics_hint: That saved a | wretch like me}
|| G . . . | D . . . ||
{end_of_grid}
`

		const once = gridMeasures(roundTrip(content))
		const twice = gridMeasures(roundTrip(roundTrip(content)))
		expect(once.map(measure => measure.lyricsHint)).toEqual([
			'Amazing grace how',
			'sweet the sound',
			'That saved a',
			'wretch like me'
		])
		expect(twice).toEqual(once)
	})

	it('is idempotent from the first generate (legacy input migrates once)', () => {
		const legacy = `{start_of_grid}
|| C . . . | G . . . ||
{lyrics_hint: Line 1}
{lyrics_hint: Line 2}
{end_of_grid}
`

		const first = roundTrip(legacy)
		const second = roundTrip(first)
		expect(second).toBe(first)
		expect(gridMeasures(first).map(measure => measure.lyricsHint)).toEqual(['Line 1', 'Line 2'])
	})

	it('preserves repeat and end bars', () => {
		const content = `{start_of_grid}
|: C . . . | G . . . :|
|| Am . / . |.
{end_of_grid}
`

		const measures = gridMeasures(roundTrip(content))
		expect(measures[0]!.startBar).toBe('repeatStart')
		expect(measures[1]!.endBar).toBe('repeatEnd')
		expect(measures[2]!.endBar).toBe('barEnd')
		expect(measures[2]!.cells.map(cell => cell.type)).toEqual(['chord', 'empty', 'noChord', 'empty'])
	})

	it('preserves metadata, labels and shape', () => {
		const content = `{title: My Song}
{artist: Me}
{key: G}
{capo: 2}
{tempo: 96}
{time: 3/4}

{start_of_grid label="Intro" shape="4x4"}
{lyrics_hint: la | la}
|| G . . | C . . ||
{end_of_grid}
`

		const reparsed = parseChordPro(roundTrip(content))
		expect(reparsed.title).toBe('My Song')
		expect(reparsed.artist).toBe('Me')
		expect(reparsed.key).toBe('G')
		expect(reparsed.capo).toBe(2)
		expect(reparsed.tempo).toBe(96)
		expect(reparsed.time).toBe('3/4')
		expect(reparsed.sections[0]!.label).toBe('Intro')
		expect((reparsed.sections[0]!.content as GridSection).shape).toBe('4x4')
	})

	it('re-flows long grids at 4 measures per line without losing hints', () => {
		const measures = Array.from({ length: 6 }, (_, index) => ({
			cells: [{ type: 'chord' as const, value: 'C' }],
			lyricsHint: `lyricsHint${index}`
		}))
		const text = generateChordPro({
			title: '',
			artist: '',
			sections: [{ type: 'grid', content: { kind: 'grid', measures } }]
		})

		const reparsed = gridMeasures(text)
		expect(reparsed.map(measure => measure.lyricsHint)).toEqual([
			'lyricsHint0', 'lyricsHint1', 'lyricsHint2', 'lyricsHint3', 'lyricsHint4', 'lyricsHint5'
		])
	})

	it('keeps an empty-cells measure alive as a placeholder beat', () => {
		const text = generateChordPro({
			title: '',
			artist: '',
			sections: [
				{
					type: 'grid',
					content: {
						kind: 'grid',
						measures: [
							{ cells: [{ type: 'chord', value: 'C' }] },
							{ cells: [], lyricsHint: 'ghost' },
							{ cells: [{ type: 'chord', value: 'G' }] }
						]
					}
				}
			]
		})

		const measures = gridMeasures(text)
		expect(measures.length).toBe(3)
		expect(measures[1]!.cells).toEqual([{ type: 'empty' }])
		expect(measures[1]!.lyricsHint).toBe('ghost')
	})
})
