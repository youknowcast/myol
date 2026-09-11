import { describe, it, expect } from 'vitest'
import { distribute, splitText, convertRows, splitSections, convertSheetToChordPro } from './converter.js'
import { parseChordPro } from '@/lib/chordpro/parser'
import sheet from './fixtures/ufret-sample-sheet.json'

describe('distribute', () => {
  it('splits evenly when weights are equal', () => {
    expect(distribute([1, 1], 4)).toEqual([2, 2])
  })

  it('gives the remainder to the largest fractional share', () => {
    // さし(2) すせ(2) そたちつ(4) -> F | C | G | G
    expect(distribute([2, 2, 4], 4)).toEqual([1, 1, 2])
  })

  it('splits 4:3 into two and two', () => {
    // てとなに(4) ぬねの(3) -> F | F | G | G
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

describe('splitText', () => {
  it('returns the whole string for a single part', () => {
    expect(splitText('abc', 1)).toEqual(['abc'])
  })

  it('splits evenly when the length is divisible', () => {
    expect(splitText('abcd', 2)).toEqual(['ab', 'cd'])
  })

  it('hands remainder characters to the earliest parts', () => {
    expect(splitText('abcde', 2)).toEqual(['abc', 'de'])
  })

  it('puts one character per part and pads when the text is short', () => {
    expect(splitText('ab', 4)).toEqual(['a', 'b', '', ''])
  })

  it('returns empty parts for empty text', () => {
    expect(splitText('', 3)).toEqual(['', '', ''])
  })
})

const row = (...cells) => ({
  cells: cells.map(([chord, text]) => ({ chord, text }))
})

describe('convertRows', () => {
  it('maps one chord to one measure when the row is already full', () => {
    const result = convertRows([row(['C', 'あい'], ['G', 'うえお'], ['Am', 'かきくけ'], ['Em7', 'こ'])], 4)
    expect(result).toEqual([
      {
        hasLyrics: true,
        blockStart: false,
        measures: [
          { chord: 'C', hint: 'あい' },
          { chord: 'G', hint: 'うえお' },
          { chord: 'Am', hint: 'かきくけ' },
          { chord: 'Em7', hint: 'こ' }
        ]
      }
    ])
  })

  it('pads a short lyric row to measuresPerRow by character count', () => {
    const result = convertRows([row(['F', 'さし'], ['C', 'すせ'], ['G', 'そたちつ'])], 4)
    expect(result[0].measures).toEqual([
      { chord: 'F', hint: 'さし' },
      { chord: 'C', hint: 'すせ' },
      { chord: 'G', hint: 'そた' },
      { chord: 'G', hint: 'ちつ' }
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
        row(['Am', 'はひ'], ['Em7', 'ふへほ'], ['Am', 'まみ'], ['Em7', 'む']),
        row([null, 'め'], ['F', 'もやゆ'], ['G', 'よら'], ['Csus4', 'りる'], ['C', 'れろ'])
      ],
      4
    )
    expect(result[0].measures[3]).toEqual({ chord: 'Em7', hint: 'むめ' })
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
    const result = convertRows([row([null, 'め'], ['F', 'もやゆ'], ['G', 'よら'], ['C', 'れろ'])], 4)
    expect(result).toHaveLength(1)
    expect(result[0].measures[0]).toEqual({ chord: 'F', hint: 'もや' })
  })

  it('attaches a leading chordless cell to the previous row last measure even when that measure is a padding repeat', () => {
    const result = convertRows(
      [
        row(['F', 'さし'], ['C', 'すせ'], ['G', 'そたちつ']),
        row([null, 'な'], ['Am', 'に'], ['G', 'ぬ'], ['F', 'ねの'])
      ],
      4
    )
    // The first row has 3 chords but measuresPerRow is 4, so distribute([2,2,4], 4) = [1,1,2]
    // gives measures [F:'さし', C:'すせ', G:'そたちつ', G:''] where the last G is a padding repeat.
    // The second row's leading chordless cell 'な' should be appended to the LAST measure,
    // which is the padding repeat G. This is correct because the lyric is still being sung
    // under that chord, so it belongs at the end of the chord's span.
    expect(result[0].measures).toEqual([
      { chord: 'F', hint: 'さし' },
      { chord: 'C', hint: 'すせ' },
      { chord: 'G', hint: 'そた' },
      { chord: 'G', hint: 'ちつな' }
    ])
  })

  it('uses raw lyric length including spaces for measure distribution', () => {
    // "1234 " is 5 raw chars (4 after trim); " 1" is 2 raw chars (1 after trim).
    // Raw weights [5, 2] -> [2, 2]; trimmed weights [4, 1] -> [3, 1].
    const result = convertRows([row(['C', '1234 '], ['G', ' 1'])], 4)
    expect(result[0].measures.map((measure) => measure.chord)).toEqual(['C', 'C', 'G', 'G'])
  })

  it('prepends a leading cell to the current row when a section break starts the row', () => {
    const result = convertRows(
      [
        row(['C', 'あ']),
        { ...row([null, 'い'], ['G', 'う']), sectionBreak: true }
      ],
      4
    )
    expect(result[0].measures[0]).toEqual({ chord: 'C', hint: 'あ' })
    expect(result[1].measures.map((measure) => measure.hint).join('')).toBe('いう')
  })

  it('marks a row that starts a section', () => {
    const result = convertRows([{ ...row(['C', 'あ']), sectionBreak: true }], 4)
    expect(result[0].blockStart).toBe(true)
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

  it('starts a new section where blockStart is set even when the lyric kind is unchanged', () => {
    const sections = splitSections([
      { ...lyricRow(), blockStart: false },
      { ...lyricRow(), blockStart: true }
    ])
    expect(sections.map((section) => section.label)).toEqual(['Verse 1', 'Verse 2'])
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

  it('escapes braces in a lyrics hint so the directive still matches and the row is not corrupted', () => {
    const text = convertSheetToChordPro({
      title: 'T',
      artist: 'A',
      capoOffset: null,
      rows: [{ cells: [{ chord: 'C', text: 'a}b' }, { chord: 'G', text: 'c' }, { chord: 'F', text: 'd' }, { chord: 'D', text: 'e' }] }]
    })
    expect(text).toContain('{lyrics_hint: a｝b | c | d | e}')

    const parsed = parseChordPro(text)
    const grid = parsed.sections.find(section => section.content.kind === 'grid')
    // The directive must still match {([^}]+)} - if the unescaped `}` broke it, this would
    // instead be parsed as a grid row with a chord cell literally named "{lyrics_hint:".
    expect(grid.content.measures.map(measure => measure.cells[0].value)).toEqual(['C', 'G', 'F', 'D'])
    expect(grid.content.measures[0].lyricsHint).toBe('a｝b')
  })

  it('escapes braces in the title so it does not corrupt the title directive', () => {
    const text = convertSheetToChordPro({ title: 'A}B', artist: 'C', capoOffset: null, rows: [] })
    expect(text).toContain('{title: A｝B}')

    const parsed = parseChordPro(text)
    // Without escaping, `{title: A}B}` fails the /^\{([^}]+)\}$/ directive regex and the
    // title comes back empty.
    expect(parsed.title).toBe('A｝B')
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

  it('matches the ChordPro snapshot generated from the sample ufret fixture', () => {
    expect(convertSheetToChordPro(sheet)).toMatchSnapshot()
  })

  it('converts the sample ufret sheet into the expected section structure', () => {
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

  it('pads short lyric rows of the sample sheet to four measures', () => {
    const text = convertSheetToChordPro(sheet)
    // さし(2) すせ(2) そたちつ(4) -> 1:1:2
    expect(text).toContain('| F | C | G | G |')
    // てとなに(4) ぬねの(3) -> 2:2
    expect(text).toContain('| F | F | G | G |')
  })

  it('produces ChordPro that myol can parse back', () => {
    const parsed = parseChordPro(convertSheetToChordPro(sheet))

    expect(parsed.title).toBe('サンプルソング')
    expect(parsed.artist).toBe('テストアーティスト')
    expect(parsed.capo).toBe(2)
    expect(parsed.tempo).toBe(120)
    expect(parsed.time).toBe('4/4')

    const grids = parsed.sections.filter(section => section.content.kind === 'grid')
    expect(grids).toHaveLength(7)
    expect(grids[0].label).toBe('Intro')
    expect(grids[0].content.measures.map(measure => measure.cells[0].value)).toEqual([
      'C', 'Am', 'F', 'G', 'C', 'Am', 'Dm7', 'G7'
    ])

    const verse1 = grids[1]
    expect(verse1.label).toBe('Verse 1')
    expect(verse1.content.measures.slice(0, 4).map(measure => measure.lyricsHint)).toEqual([
      'あい', 'うえお', 'かきくけ', 'こ'
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
