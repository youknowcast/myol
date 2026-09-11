import { describe, it, expect } from 'vitest'
import { parseChordDatas, parseMeta, buildSheet, findChordDatas } from './extract.js'

describe('parseChordDatas', () => {
  it('reads the embedded ufret chord data array', () => {
    const source = 'var ufret_musical_sheet;\nvar ufret_chord_datas = ["[C]a", "[G]b"];\nvar x;'
    expect(parseChordDatas(source)).toEqual(['[C]a', '[G]b'])
  })

  it('keeps escaped characters and full-width spaces', () => {
    const source = 'var ufret_chord_datas = ["[C]\\u3000[G]x\\/y"];'
    expect(parseChordDatas(source)).toEqual(['[C]\u3000[G]x/y'])
  })

  it('keeps brackets and escaped quotes inside chord-data strings', () => {
    const source = 'var ufret_chord_datas = ["[C]a]b", "[G]x\\"y"];'
    expect(parseChordDatas(source)).toEqual(['[C]a]b', '[G]x"y'])
  })

  it('returns null when the variable is absent', () => {
    expect(parseChordDatas('<html></html>')).toBeNull()
  })

  it('returns null when the literal is not valid JSON', () => {
    expect(parseChordDatas('var ufret_chord_datas = [not json];')).toBeNull()
  })
})

describe('parseMeta', () => {
  it('extracts and normalizes the title and artist', () => {
    const html =
      '<h1 class="p-detail-head__ttl">\n  サンプル曲  </h1>' +
      '<a class="p-detail-head__artist" href="/artist.php?data=x">テスト</a>'
    expect(parseMeta(html)).toEqual({ title: 'サンプル曲', artist: 'テスト' })
  })

  it('strips nested tags and collapses whitespace', () => {
    const html =
      '<h1 class="p-detail-head__ttl"><span>A</span>\n B</h1>' +
      '<a class="p-detail-head__artist"><b>C</b>  D</a>'
    expect(parseMeta(html)).toEqual({ title: 'A B', artist: 'C D' })
  })

  it('returns empty strings when the elements are missing', () => {
    expect(parseMeta('<html></html>')).toEqual({ title: '', artist: '' })
  })
})

describe('buildSheet', () => {
  const meta = { title: 'T', artist: 'A', capoOffset: null }

  it('builds chord cells with the lyric that follows each chord', () => {
    const sheet = buildSheet(['[C]あい[G]うえ'], meta)
    expect(sheet.rows).toEqual([
      { cells: [{ chord: 'C', text: 'あい' }, { chord: 'G', text: 'うえ' }] }
    ])
  })

  it('adds a leading chordless cell for text before the first chord', () => {
    const sheet = buildSheet(['x[C]y'], meta)
    expect(sheet.rows[0].cells).toEqual([
      { chord: null, text: 'x' },
      { chord: 'C', text: 'y' }
    ])
  })

  it('marks the row after a blank line as a section break', () => {
    const sheet = buildSheet(['[C]a', '', '[G]b'], meta)
    expect(sheet.rows[0].sectionBreak).toBeUndefined()
    expect(sheet.rows[1].sectionBreak).toBe(true)
  })

  it('strips a trailing CR and a leading BOM', () => {
    const sheet = buildSheet(['\ufeff[C]a\r'], meta)
    expect(sheet.rows[0].cells).toEqual([{ chord: 'C', text: 'a' }])
  })

  it('treats ufret and N.C. no-chord markers as no chord', () => {
    const sheet = buildSheet(['[　/　]a[N.C.]b[NC]c'], meta)
    expect(sheet.rows[0].cells.map((cell) => cell.chord)).toEqual([null, null, null])
  })

  it('copies metadata and capoOffset onto the sheet', () => {
    const sheet = buildSheet(['[C]a'], { title: 'T', artist: 'A', capoOffset: -2 })
    expect(sheet.title).toBe('T')
    expect(sheet.artist).toBe('A')
    expect(sheet.capoOffset).toBe(-2)
  })
})

describe('findChordDatas', () => {
  it('returns the data from the first script that contains it', () => {
    const result = findChordDatas(['window.x = 1', 'var ufret_chord_datas = ["[C]a"];'])
    expect(result).toEqual(['[C]a'])
  })

  it('returns null when no script contains the data', () => {
    expect(findChordDatas(['window.x = 1'])).toBeNull()
  })
})
