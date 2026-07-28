import { describe, it, expect } from 'vitest'
import { distribute, convertRows } from './converter.js'

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
})
