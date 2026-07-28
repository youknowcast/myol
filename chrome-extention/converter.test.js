import { describe, it, expect } from 'vitest'
import { distribute, convertRows, splitSections, convertSheetToChordPro } from './converter.js'
import { parseChordPro } from '@/lib/chordpro/parser'
import sheet from './fixtures/ufret-yasashii-ano-ko.json'

describe('distribute', () => {
  it('splits evenly when weights are equal', () => {
    expect(distribute([1, 1], 4)).toEqual([2, 2])
  })

  it('gives the remainder to the largest fractional share', () => {
    // 暗い(2) 道が(2) 続いてて(4) -> F | C | G | G
    expect(distribute([2, 2, 4], 4)).toEqual([1, 1, 2])
  })

  it('splits 4:3 into two and two', () => {
    // 丸い大空(4) の色を(3) -> F | F | G | G
    expect(distribute([4, 3], 4)).toEqual([2, 2])
  })

  it('guarantees at least one measure per chord', () => {
    expect(distribute([1, 100], 4)).toEqual([1, 3])
  })

  it('returns one measure each when there are at least as many weights as measures', () => {
    expect(distribute([1, 1, 1, 1], 4)).toEqual([1, 1, 1, 1])
    expect(distribute([5, 1, 1, 1, 1], 4)).toEqual([1, 1, 1, 1, 1])
  })

  it('returns an empty array for no weights', () => {
    expect(distribute([], 4)).toEqual([])
  })

  it('always sums to the requested total', () => {
    expect(distribute([3, 1], 4).reduce((a, b) => a + b, 0)).toBe(4)
    expect(distribute([1, 2, 3], 8).reduce((a, b) => a + b, 0)).toBe(8)
  })
})

const row = (...cells) => ({
  cells: cells.map(([chord, text]) => ({ chord, text }))
})

describe('convertRows', () => {
  it('maps one chord to one measure when the row is already full', () => {
    const result = convertRows([row(['C', '重い'], ['G', '扉を押'], ['Am', 'し開けた'], ['Em7', 'ら'])], 4)
    expect(result).toEqual([
      {
        hasLyrics: true,
        measures: [
          { chord: 'C', hint: '重い' },
          { chord: 'G', hint: '扉を押' },
          { chord: 'Am', hint: 'し開けた' },
          { chord: 'Em7', hint: 'ら' }
        ]
      }
    ])
  })

  it('pads a short lyric row to measuresPerRow by character count', () => {
    const result = convertRows([row(['F', '暗い'], ['C', '道が'], ['G', '続いてて'])], 4)
    expect(result[0].measures).toEqual([
      { chord: 'F', hint: '暗い' },
      { chord: 'C', hint: '道が' },
      { chord: 'G', hint: '続いてて' },
      { chord: 'G', hint: '' }
    ])
  })

  it('keeps one chord per measure for a short row without lyrics', () => {
    const result = convertRows([row(['A#', ''], ['F', ''], ['C', ''])], 4)
    expect(result[0].hasLyrics).toBe(false)
    expect(result[0].measures).toEqual([
      { chord: 'A#', hint: '' },
      { chord: 'F', hint: '' },
      { chord: 'C', hint: '' }
    ])
  })

  it('keeps every chord when the row has more chords than measuresPerRow', () => {
    const result = convertRows([row(['A#', ''], ['F', ''], ['G', ''], ['Am', ''], ['G/B', ''], ['E', ''])], 4)
    expect(result[0].measures.map(m => m.chord)).toEqual(['A#', 'F', 'G', 'Am', 'G/B', 'E'])
  })

  it('merges a leading chordless cell into the previous row last measure', () => {
    const result = convertRows(
      [
        row(['Am', '氷'], ['Em7', 'を散らす'], ['Am', '風す'], ['Em7', 'ら']),
        row([null, '味'], ['F', '方に'], ['G', 'もで'], ['Csus4', 'きるんだ'], ['C', 'なあ'])
      ],
      4
    )
    expect(result[0].measures[3]).toEqual({ chord: 'Em7', hint: 'ら味' })
    expect(result[1].measures.map(m => m.chord)).toEqual(['F', 'G', 'Csus4', 'C'])
  })

  it('appends a mid-row chordless cell to the preceding chord in the same row', () => {
    const result = convertRows([row(['C', 'あ'], [null, 'い'], ['G', 'う'], ['Am', 'え'], ['F', 'お'])], 4)
    expect(result[0].measures).toEqual([
      { chord: 'C', hint: 'あい' },
      { chord: 'G', hint: 'う' },
      { chord: 'Am', hint: 'え' },
      { chord: 'F', hint: 'お' }
    ])
  })

  it('drops rows that have no chord at all', () => {
    expect(convertRows([row([null, ''], [null, ''])], 4)).toEqual([])
  })

  it('drops a leading chordless cell when there is no previous row', () => {
    const result = convertRows([row([null, '味'], ['F', '方に'], ['G', 'もで'], ['C', 'なあ'])], 4)
    expect(result).toHaveLength(1)
    expect(result[0].measures[0]).toEqual({ chord: 'F', hint: '方に' })
  })

  it('attaches a leading chordless cell to the previous row last measure even when that measure is a padding repeat', () => {
    const result = convertRows(
      [
        row(['F', '暗い'], ['C', '道が'], ['G', '続いてて']),
        row([null, 'て'], ['Am', 'い'], ['G', 'け'], ['F', 'った'])
      ],
      4
    )
    // The first row has 3 chords but measuresPerRow is 4, so distribute([2,2,4], 4) = [1,1,2]
    // gives measures [F:'暗い', C:'道が', G:'続いてて', G:''] where the last G is a padding repeat.
    // The second row's leading chordless cell 'て' should be appended to the LAST measure,
    // which is the padding repeat G. This is correct because the lyric is still being sung
    // under that chord, so it belongs at the end of the chord's span.
    expect(result[0].measures).toEqual([
      { chord: 'F', hint: '暗い' },
      { chord: 'C', hint: '道が' },
      { chord: 'G', hint: '続いてて' },
      { chord: 'G', hint: 'て' }
    ])
  })
})

const lyricRow = () => ({ measures: [{ chord: 'C', hint: 'あ' }], hasLyrics: true })
const instrumentalRow = () => ({ measures: [{ chord: 'F', hint: '' }], hasLyrics: false })

describe('splitSections', () => {
  it('labels a leading instrumental block as Intro and a trailing one as Outro', () => {
    const sections = splitSections([instrumentalRow(), lyricRow(), instrumentalRow()])
    expect(sections.map(s => s.label)).toEqual(['Intro', 'Verse 1', 'Outro'])
  })

  it('numbers verses and interludes independently', () => {
    const sections = splitSections([
      instrumentalRow(),
      lyricRow(),
      instrumentalRow(),
      lyricRow(),
      instrumentalRow(),
      lyricRow(),
      instrumentalRow()
    ])
    expect(sections.map(s => s.label)).toEqual([
      'Intro',
      'Verse 1',
      'Interlude 1',
      'Verse 2',
      'Interlude 2',
      'Verse 3',
      'Outro'
    ])
  })

  it('groups consecutive rows of the same kind into one section', () => {
    const sections = splitSections([instrumentalRow(), instrumentalRow(), lyricRow(), lyricRow()])
    expect(sections).toHaveLength(2)
    expect(sections[0].rows).toHaveLength(2)
    expect(sections[1].rows).toHaveLength(2)
  })

  it('prefers Intro over Outro when the whole song has no lyrics', () => {
    const sections = splitSections([instrumentalRow(), instrumentalRow()])
    expect(sections.map(s => s.label)).toEqual(['Intro'])
  })

  it('returns no sections for no rows', () => {
    expect(splitSections([])).toEqual([])
  })
})

describe('convertSheetToChordPro', () => {
  it('emits metadata with a capo derived from the ufret offset', () => {
    const text = convertSheetToChordPro({ title: 'T', artist: 'A', capoOffset: -2, rows: [] })
    expect(text).toContain('{title: T}')
    expect(text).toContain('{artist: A}')
    expect(text).toContain('{capo: 2}')
    expect(text).toContain('{tempo: 120}')
    expect(text).toContain('{time: 4/4}')
  })

  it('omits capo when the offset is zero or absent', () => {
    expect(convertSheetToChordPro({ title: 'T', artist: 'A', capoOffset: 0, rows: [] })).not.toContain('{capo:')
    expect(convertSheetToChordPro({ title: 'T', artist: 'A', capoOffset: null, rows: [] })).not.toContain('{capo:')
  })

  it('omits capo when the offset is positive (transposed up, no capo applies)', () => {
    expect(convertSheetToChordPro({ title: 'T', artist: 'A', capoOffset: 2, rows: [] })).not.toContain('{capo:')
  })

  it('escapes a pipe in the lyrics so it cannot break the hint separator', () => {
    const text = convertSheetToChordPro({
      title: 'T',
      artist: 'A',
      capoOffset: null,
      rows: [{ cells: [{ chord: 'C', text: 'a|b' }, { chord: 'G', text: 'c' }, { chord: 'F', text: 'd' }, { chord: 'D', text: 'e' }] }]
    })
    expect(text).toContain('{lyrics_hint: a｜b | c | d | e}')
  })

  it('derives measuresPerRow from the time signature', () => {
    const rows = [{ cells: [{ chord: 'C', text: 'あ' }, { chord: 'G', text: 'い' }] }]
    const text = convertSheetToChordPro({ title: 'T', artist: 'A', capoOffset: null, rows }, { time: '3/4' })
    expect(text).toContain('{time: 3/4}')
    expect(text).toContain('| C | C | G |')
  })

  it('falls back to 4 measures per row when the time numerator is non-numeric, instead of silently dropping the row', () => {
    const rows = [{ cells: [{ chord: 'C', text: 'あ' }, { chord: 'G', text: 'い' }] }]
    const text = convertSheetToChordPro({ title: 'T', artist: 'A', capoOffset: null, rows }, { time: 'x/4' })
    expect(text).toContain('{time: x/4}')
    expect(text).not.toContain('| |')
    expect(text).toContain('| C | C | G | G |')
  })

  it('falls back to 4 measures per row when the time is an empty string, instead of silently dropping the row', () => {
    const rows = [{ cells: [{ chord: 'C', text: 'あ' }, { chord: 'G', text: 'い' }] }]
    const text = convertSheetToChordPro({ title: 'T', artist: 'A', capoOffset: null, rows }, { time: '' })
    expect(text).not.toContain('| |')
    expect(text).toContain('| C | C | G | G |')
  })

  it('converts the real ufret sheet into the expected section structure', () => {
    const text = convertSheetToChordPro(sheet)
    const labels = [...text.matchAll(/\{start_of_grid label="([^"]+)"\}/g)].map(m => m[1])
    expect(labels).toEqual([
      'Intro',
      'Verse 1',
      'Interlude 1',
      'Verse 2',
      'Interlude 2',
      'Verse 3',
      'Outro'
    ])
  })

  it('pads short lyric rows of the real sheet to four measures', () => {
    const text = convertSheetToChordPro(sheet)
    // 暗い(2) 道が(2) 続いてて(4) -> 1:1:2
    expect(text).toContain('| F | C | G | G |')
    // 丸い大空(4) の色を(3) -> 2:2
    expect(text).toContain('| F | F | G | G |')
  })

  it('produces ChordPro that myol can parse back', () => {
    const parsed = parseChordPro(convertSheetToChordPro(sheet))

    expect(parsed.title).toBe('優しいあの子')
    expect(parsed.artist).toBe('スピッツ')
    expect(parsed.capo).toBe(2)
    expect(parsed.tempo).toBe(120)
    expect(parsed.time).toBe('4/4')

    const grids = parsed.sections.filter(section => section.content.kind === 'grid')
    expect(grids).toHaveLength(7)
    expect(grids[0].label).toBe('Intro')
    expect(grids[0].content.measures.map(measure => measure.cells[0].value)).toEqual([
      'C', 'G/B', 'Am', 'Em7', 'F', 'G', 'Csus4', 'C'
    ])

    const verse1 = grids[1]
    expect(verse1.label).toBe('Verse 1')
    expect(verse1.content.measures.slice(0, 4).map(measure => measure.lyricsHint)).toEqual([
      '重い', '扉を押', 'し開けた', 'ら'
    ])

    // 全小節がちょうど 1 セル (= 小節いっぱいのコード) であること
    for (const grid of grids) {
      for (const measure of grid.content.measures) {
        expect(measure.cells).toHaveLength(1)
        expect(measure.cells[0].type).toBe('chord')
      }
    }
  })
})
