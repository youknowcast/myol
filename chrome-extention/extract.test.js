import { describe, it, expect } from 'vitest'
import {
  parseChordDatas,
  parseMeta,
  buildSheet,
  findChordDatas,
  extractFromHtml,
  extractFromDocument
} from './extract.js'

function fakeElement({ tag = 'div', id = '', className = '', text = '', attrs = {}, children = [] } = {}) {
  const node = {
    tagName: tag.toUpperCase(),
    id,
    classList: className ? className.split(/\s+/).filter(Boolean) : [],
    textContent: text,
    attributes: attrs,
    children,
    parent: null,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
    },
    querySelectorAll(selector) {
      return descendants(this).filter((child) => matchesSelector(child, selector))
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null
    }
  }
  for (const child of children) child.parent = node
  return node
}

function descendants(node) {
  const result = []
  for (const child of node.children) {
    result.push(child)
    result.push(...descendants(child))
  }
  return result
}

function matchesSelector(node, selector) {
  const parts = selector.trim().split(/\s+/)
  if (parts.length === 1) return matchesSimple(node, parts[0])
  if (!matchesSimple(node, parts[parts.length - 1])) return false
  let ancestor = node.parent
  let index = parts.length - 2
  while (ancestor && index >= 0) {
    if (matchesSimple(ancestor, parts[index])) index -= 1
    ancestor = ancestor.parent
  }
  return index < 0
}

function matchesSimple(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1)
  if (selector.startsWith('.')) return node.classList.includes(selector.slice(1))
  const dot = selector.indexOf('.')
  if (dot !== -1) {
    const tag = selector.slice(0, dot)
    const cls = selector.slice(dot + 1)
    return node.tagName === tag.toUpperCase() && node.classList.includes(cls)
  }
  return node.tagName === selector.toUpperCase()
}

function fakeDocument({ scripts = [], chordRoot = null, title = null, artist = null } = {}) {
  const children = [...scripts]
  if (title !== null) children.push(fakeElement({ tag: 'h1', className: 'p-detail-head__ttl', text: title }))
  if (artist !== null) children.push(fakeElement({ tag: 'a', className: 'p-detail-head__artist', text: artist }))
  if (chordRoot) children.push(chordRoot)
  return fakeElement({ tag: 'html', children })
}

function chordCell(chord, ...cols) {
  return fakeElement({
    tag: 'p',
    className: 'chord',
    children: [
      fakeElement({ tag: 'rt', text: chord }),
      fakeElement({
        tag: 'span',
        className: 'mejiowvnz',
        children: cols.map((col) => fakeElement({ tag: 'span', className: 'col', text: col }))
      })
    ]
  })
}

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

describe('extractFromHtml', () => {
  const html =
    '<h1 class="p-detail-head__ttl">サンプル</h1>' +
    '<a class="p-detail-head__artist">作者</a>' +
    '<script>var ufret_chord_datas = ["[C]あ", "[G]\u3000"];</script>'

  it('returns an ok result with a sheet built from the raw data', () => {
    const result = extractFromHtml(html)
    expect(result.status).toBe('ok')
    expect(result.sheet.title).toBe('サンプル')
    expect(result.sheet.artist).toBe('作者')
    expect(result.sheet.capoOffset).toBeNull()
    expect(result.sheet.rows[0].cells).toEqual([{ chord: 'C', text: 'あ' }])
  })

  it('returns unsupported when the page has no chord data', () => {
    expect(extractFromHtml('<html></html>')).toEqual({ status: 'unsupported' })
  })
})

describe('extractFromDocument', () => {
  it('prefers raw chord data from a script and reads the page metadata', () => {
    const doc = fakeDocument({
      scripts: [
        fakeElement({ tag: 'script', text: 'var ufret_chord_datas = ["[C]la[G]la"];' })
      ],
      title: 'サンプル曲',
      artist: 'サンプル歌手'
    })

    const result = extractFromDocument(doc)
    expect(result.status).toBe('ok')
    expect(result.sheet.title).toBe('サンプル曲')
    expect(result.sheet.artist).toBe('サンプル歌手')
    expect(result.sheet.rows[0].cells).toEqual([
      { chord: 'C', text: 'la' },
      { chord: 'G', text: 'la' }
    ])
  })

  it('falls back to the rendered DOM, reading capo and each chord cell', () => {
    const chordRoot = fakeElement({
      tag: 'div',
      id: 'my-chord-data',
      attrs: { capo: '-2' },
      children: [
        fakeElement({
          tag: 'div',
          className: 'chord-row',
          children: [chordCell('C', 'あ', 'い'), chordCell('G', 'う')]
        }),
        fakeElement({
          tag: 'div',
          className: 'chord-row',
          children: [chordCell('Am', 'え')]
        })
      ]
    })

    const result = extractFromDocument(fakeDocument({ chordRoot }))
    expect(result.status).toBe('ok')
    expect(result.sheet.capoOffset).toBe(-2)
    expect(result.sheet.rows).toEqual([
      { cells: [{ chord: 'C', text: 'あい' }, { chord: 'G', text: 'う' }] },
      { cells: [{ chord: 'Am', text: 'え' }] }
    ])
  })

  it('reports loading when the DOM is present but has no chord rows yet', () => {
    const chordRoot = fakeElement({ tag: 'div', id: 'my-chord-data', children: [] })
    expect(extractFromDocument(fakeDocument({ chordRoot }))).toEqual({ status: 'loading' })
  })

  it('reports unsupported when there is neither raw data nor the chord root', () => {
    expect(extractFromDocument(fakeDocument())).toEqual({ status: 'unsupported' })
  })
})
