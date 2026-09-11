# ufret Import Accuracy + Local Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract ufret chord sheets from the page's embedded `ufret_chord_datas` raw data, improve ChordPro measure/hint accuracy, and let any agent save a sheet locally via a skill-backed CLI.

**Architecture:** A dependency-free shared module `chrome-extention/extract.js` turns ufret HTML / live documents into an `ExtractedSheet`. `converter.js` turns that into Extended Grid ChordPro. The Chrome content script prefers raw data (DOM fallback), and a Node CLI (`scripts/import-ufret.mjs`) drives the same pipeline for agents. A global skill documents how agents invoke the CLI.

**Tech Stack:** Vue 3 + Vite repo already present; Node 25 (global `fetch`), ESM, vitest, eslint, Chrome MV3 extension (buildless).

**Spec:** `docs/specs/2026-09-11-ufret-import-design.md`

## Global Constraints

- Node 25 / ESM. The repo runs `npm test` (vitest) and `npm run lint` (eslint).
- The Chrome extension is **buildless**: `chrome-extention/*.js` must not import from `src/`. Manifest `content_scripts` are classic scripts (no top-level `export`); `web_accessible_resources` + dynamic `import()` is the sharing mechanism.
- `extract.js` and `converter.js` are pure (no DOM, no Node globals) so both the extension and the CLI can use them. `extractFromDocument` is the only DOM-touching function.
- Follow existing code style. `converter.js` uses JSDoc typedefs for its data shapes; mirror that and keep incidental comments minimal (repo prefers few comments).
- **Never commit real song lyrics or chord sheets.** Every test fixture is synthetic.
- CLI default output directory is outside the repo: `~/Music/myol/`.
- Commits: only create commits when the user has explicitly approved them (project CLAUDE.md overrides the plan's commit steps). If commits are not approved, stop after each task's verification and report.
- Run tests from the repo root: `npm test`.

---

### Task 1: Raw-data parser core (`extract.js`)

**Files:**
- Create: `chrome-extention/extract.js`
- Create: `chrome-extention/extract.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `parseChordDatas(source: string): string[] | null`
  - `parseMeta(source: string): { title: string, artist: string }`
  - `buildSheet(chordDatas: string[], meta: { title: string, artist: string, capoOffset: number|null }): ExtractedSheet`
  - `findChordDatas(scriptTexts: string[]): string[] | null`
  - `ExtractedSheet = { title: string, artist: string, capoOffset: number|null, rows: ExtractedRow[] }`, `ExtractedRow = { cells: { chord: string|null, text: string }[], sectionBreak?: boolean }`

- [ ] **Step 1: Write the failing tests**

Create `chrome-extention/extract.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run chrome-extention/extract.test.js`
Expected: FAIL — cannot resolve `./extract.js`.

- [ ] **Step 3: Implement `chrome-extention/extract.js`**

```js
/** @typedef {{ chord: string|null, text: string }} ExtractedCell */
/** @typedef {{ cells: ExtractedCell[], sectionBreak?: boolean }} ExtractedRow */
/**
 * @typedef {Object} ExtractedSheet
 * @property {string} title
 * @property {string} artist
 * @property {number|null} capoOffset
 * @property {ExtractedRow[]} rows
 */

const CHORD_TOKEN = /\[.+?\]/g

/** @param {string} value */
function normalizeText(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** @param {string} chord @returns {string|null} */
function normalizeChord(chord) {
  const trimmed = chord.trim()
  const compact = trimmed.replace(/[\s\u3000]/g, '')
  if (compact === '' || compact === '/' || compact === 'N.C.' || compact === 'N.C' || compact === 'NC') {
    return null
  }
  return trimmed
}

/**
 * ソース中の `var ufret_chord_datas = [...]` の配列リテラルだけを切り出す。
 * 文字列内の `]` を数えないよう quote/escape を追跡する。
 * @param {string} source
 * @param {number} startIndex
 * @returns {string|null}
 */
function sliceArrayLiteral(source, startIndex) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return source.slice(startIndex, i + 1)
    }
  }
  return null
}

/**
 * @param {string} source HTML または JS 断片
 * @returns {string[]|null}
 */
export function parseChordDatas(source) {
  const anchor = source.search(/var\s+ufret_chord_datas\s*=/)
  if (anchor === -1) return null
  const start = source.indexOf('[', anchor)
  if (start === -1) return null
  const literal = sliceArrayLiteral(source, start)
  if (!literal) return null
  try {
    const parsed = JSON.parse(literal)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * @param {string} source
 * @returns {{ title: string, artist: string }}
 */
export function parseMeta(source) {
  const titleMatch = source.match(/<h1[^>]*class="[^"]*p-detail-head__ttl[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
  const artistMatch = source.match(/<a[^>]*class="[^"]*p-detail-head__artist[^"]*"[^>]*>([\s\S]*?)<\/a>/)
  return {
    title: titleMatch ? normalizeText(titleMatch[1]) : '',
    artist: artistMatch ? normalizeText(artistMatch[1]) : ''
  }
}

/** @param {string} line @returns {ExtractedCell[]} */
function cellsFromLine(line) {
  const segments = line.split(/\[.+?\]/)
  const chords = line.match(CHORD_TOKEN) || []
  const cells = []
  const leading = segments[0] ?? ''
  if (leading !== '') cells.push({ chord: null, text: leading })
  chords.forEach((token, index) => {
    cells.push({ chord: normalizeChord(token.slice(1, -1)), text: segments[index + 1] ?? '' })
  })
  return cells
}

/**
 * @param {string[]} chordDatas
 * @param {{ title?: string, artist?: string, capoOffset?: number|null }} meta
 * @returns {ExtractedSheet}
 */
export function buildSheet(chordDatas, meta = {}) {
  const rows = []
  let pendingBreak = false
  for (const raw of chordDatas) {
    const line = String(raw).replace(/\r$/, '').replace(/^\ufeff/, '')
    if (line.trim() === '') {
      pendingBreak = true
      continue
    }
    const row = { cells: cellsFromLine(line) }
    if (pendingBreak) row.sectionBreak = true
    pendingBreak = false
    rows.push(row)
  }
  return {
    title: meta.title ?? '',
    artist: meta.artist ?? '',
    capoOffset: meta.capoOffset ?? null,
    rows
  }
}

/**
 * @param {string[]} scriptTexts 各 inline script の textContent
 * @returns {string[]|null}
 */
export function findChordDatas(scriptTexts) {
  for (const text of scriptTexts) {
    if (!text.includes('ufret_chord_datas')) continue
    const datas = parseChordDatas(text)
    if (datas) return datas
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run chrome-extention/extract.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Lint the new files**

Run: `npx eslint chrome-extention/extract.js chrome-extention/extract.test.js`
Expected: no errors.

- [ ] **Step 6: Commit (only if the user approved commits)**

```bash
git add chrome-extention/extract.js chrome-extention/extract.test.js
git commit -m "Add ufret raw chord-data parser"
```

---

### Task 2: HTML and live-document extraction

**Files:**
- Modify: `chrome-extention/extract.js` (append two functions)
- Modify: `chrome-extention/extract.test.js` (append tests)

**Interfaces:**
- Consumes: `parseChordDatas`, `parseMeta`, `buildSheet`, `findChordDatas` from Task 1.
- Produces:
  - `extractFromHtml(html: string): { status: 'unsupported'|'ok', sheet?: ExtractedSheet }`
  - `extractFromDocument(doc: Document): { status: 'unsupported'|'loading'|'ok', sheet?: ExtractedSheet }`

- [ ] **Step 1: Write the failing tests**

Append to `chrome-extention/extract.test.js`:

```js
import { extractFromHtml } from './extract.js'

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run chrome-extention/extract.test.js`
Expected: FAIL — `extractFromHtml` is not exported.

- [ ] **Step 3: Implement the functions in `chrome-extention/extract.js`**

Append:

```js
/**
 * @param {string} html
 * @returns {{ status: 'unsupported'|'ok', sheet?: ExtractedSheet }}
 */
export function extractFromHtml(html) {
  const chordDatas = parseChordDatas(html)
  if (!chordDatas) return { status: 'unsupported' }
  return { status: 'ok', sheet: buildSheet(chordDatas, { ...parseMeta(html), capoOffset: null }) }
}

/** @param {Document} doc */
function metaFromDocument(doc) {
  return {
    title: normalizeText(doc.querySelector('h1.p-detail-head__ttl')?.textContent ?? ''),
    artist: normalizeText(doc.querySelector('a.p-detail-head__artist')?.textContent ?? '')
  }
}

/** @param {Document} doc @returns {number|null} */
function capoOffsetFromDocument(doc) {
  const attr = doc.querySelector('#my-chord-data')?.getAttribute('capo') ?? null
  if (attr === null || attr.trim() === '' || Number.isNaN(Number(attr))) return null
  return Number(attr)
}

/**
 * @param {Document} doc
 * @returns {{ status: 'unsupported'|'loading'|'ok', sheet?: ExtractedSheet }}
 */
export function extractFromDocument(doc) {
  const chordDatas = findChordDatas(
    Array.from(doc.querySelectorAll('script')).map((script) => script.textContent ?? '')
  )
  const capoOffset = capoOffsetFromDocument(doc)

  if (chordDatas) {
    return { status: 'ok', sheet: buildSheet(chordDatas, { ...metaFromDocument(doc), capoOffset }) }
  }

  const root = doc.querySelector('#my-chord-data')
  if (!root) return { status: 'unsupported' }
  const rowEls = root.querySelectorAll('.chord-row')
  if (rowEls.length === 0) return { status: 'loading' }

  const rows = Array.from(rowEls).map((row) => ({
    cells: Array.from(row.querySelectorAll('p.chord')).map((cell) => ({
      chord: (cell.querySelector('rt')?.textContent ?? '').trim() || null,
      text: Array.from(cell.querySelectorAll('.mejiowvnz .col'))
        .map((col) => col.textContent ?? '')
        .join('')
    }))
  }))

  return { status: 'ok', sheet: { ...metaFromDocument(doc), capoOffset, rows } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run chrome-extention/extract.test.js`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `npx eslint chrome-extention/extract.js chrome-extention/extract.test.js`
Expected: no errors.

- [ ] **Step 6: Commit (only if the user approved commits)**

```bash
git add chrome-extention/extract.js chrome-extention/extract.test.js
git commit -m "Add raw/DOM extraction entry points"
```

---

### Task 3: Converter accuracy (hint splitting, raw weights, sections)

**Files:**
- Modify: `chrome-extention/converter.js`
- Modify: `chrome-extention/converter.test.js`
- Modify (regenerate): `chrome-extention/snapshots/converter.test.js.snap`

**Interfaces:**
- Consumes: `ExtractedRow`/`ExtractedCell` shapes from Tasks 1–2 (`sectionBreak` on rows).
- Produces (changed/added exports):
  - `splitText(text: string, parts: number): string[]`
  - `convertRows(rows, measuresPerRow): ConvertedRow[]` where `ConvertedRow = { measures: ConvertedMeasure[], hasLyrics: boolean, blockStart?: boolean }`
  - `splitSections(rows): ConvertedSection[]` (unchanged signature; now respects `blockStart`)
  - `distribute` and `convertSheetToChordPro` signatures unchanged.

- [ ] **Step 1: Write the failing tests**

Add `splitText` to the import line at the top of `chrome-extention/converter.test.js`:

```js
import { distribute, splitText, convertRows, splitSections, convertSheetToChordPro } from './converter.js'
```

Add a new describe block after the `distribute` block:

```js
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
```

Change the existing expectation in `convertRows` "pads a short lyric row to measuresPerRow by character count" from:

```js
    expect(result[0].measures).toEqual([
      { chord: 'F', hint: 'さし' },
      { chord: 'C', hint: 'すせ' },
      { chord: 'G', hint: 'そたちつ' },
      { chord: 'G', hint: '' }
    ])
```

to:

```js
    expect(result[0].measures).toEqual([
      { chord: 'F', hint: 'さし' },
      { chord: 'C', hint: 'すせ' },
      { chord: 'G', hint: 'そた' },
      { chord: 'G', hint: 'ちつ' }
    ])
```

Change the expectation in "drops a leading chordless cell when there is no previous row" from
`{ chord: 'F', hint: 'もやゆ' }` to `{ chord: 'F', hint: 'もや' }` (the F chord now spans two
measures and its text is split).

Change the last expectation in "attaches a leading chordless cell to the previous row last measure even when that measure is a padding repeat":

```js
    expect(result[0].measures).toEqual([
      { chord: 'F', hint: 'さし' },
      { chord: 'C', hint: 'すせ' },
      { chord: 'G', hint: 'そた' },
      { chord: 'G', hint: 'ちつな' }
    ])
```

Add new `convertRows` and `splitSections` tests:

```js
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
```

Add to the `splitSections` describe:

```js
  it('starts a new section where blockStart is set even when the lyric kind is unchanged', () => {
    const sections = splitSections([
      { ...lyricRow(), blockStart: false },
      { ...lyricRow(), blockStart: true }
    ])
    expect(sections.map((section) => section.label)).toEqual(['Verse 1', 'Verse 2'])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: FAIL — `splitText` is not exported, and the updated hint expectations do not match.

- [ ] **Step 3: Implement the `converter.js` changes**

Replace the `ConvertedMeasure`/`ConvertedRow` typedef block with:

```js
/** @typedef {{ chord: string, hint: string }} ConvertedMeasure */
/** @typedef {{ measures: ConvertedMeasure[], hasLyrics: boolean, blockStart?: boolean }} ConvertedRow */
```

Add `splitText` immediately after `distribute`:

```js
/**
 * 文字列を parts 個に前詰めで分割する。余りは先頭側の要素へ 1 文字ずつ配る。
 *
 * @param {string} text
 * @param {number} parts
 * @returns {string[]}
 */
export function splitText(text, parts) {
  if (parts <= 1) return [text]
  const result = Array.from({ length: parts }, () => '')
  if (text.length === 0) return result
  const base = Math.floor(text.length / parts)
  let remainder = text.length % parts
  let cursor = 0
  for (let i = 0; i < parts; i++) {
    const size = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder -= 1
    result[i] = text.slice(cursor, cursor + size)
    cursor += size
  }
  return result
}
```

Replace the body of `convertRows` with:

```js
export function convertRows(rows, measuresPerRow) {
  /** @type {ConvertedRow[]} */
  const converted = []

  for (const row of rows) {
    const { leading, groups } = groupCellsByChord(row.cells)
    const trimmedLeading = leading.trim()

    if (trimmedLeading) {
      if (converted.length === 0) {
        // 先頭行の行頭歌詞はぶら下がるコードが無いので捨てる
      } else if (row.sectionBreak) {
        // セクション境界を跨いで前行へ連結すると別セクションに歌詞が付くため、
        // この行の先頭コードの歌詞へ前置きする
        if (groups.length > 0) groups[0].text = trimmedLeading + groups[0].text
      } else {
        const previous = converted[converted.length - 1]
        const lastMeasure = previous.measures[previous.measures.length - 1]
        if (lastMeasure) {
          lastMeasure.hint += trimmedLeading
          previous.hasLyrics = true
        }
      }
    }

    if (groups.length === 0) continue

    const hasLyrics = groups.some(group => group.text.trim().length > 0)
    const counts =
      groups.length >= measuresPerRow || !hasLyrics
        ? groups.map(() => 1)
        : distribute(groups.map(group => Math.max(group.text.length, 1)), measuresPerRow)

    /** @type {ConvertedMeasure[]} */
    const measures = []
    groups.forEach((group, index) => {
      const chunks = splitText(group.text.trim(), counts[index])
      for (let repeat = 0; repeat < counts[index]; repeat++) {
        measures.push({ chord: group.chord, hint: chunks[repeat] })
      }
    })

    converted.push({ measures, hasLyrics, blockStart: row.sectionBreak === true })
  }

  return converted
}
```

Replace the body of `splitSections` with:

```js
export function splitSections(rows) {
  /** @type {{ hasLyrics: boolean, rows: ConvertedRow[] }[]} */
  const blocks = []
  for (const row of rows) {
    const last = blocks[blocks.length - 1]
    if (!last || row.blockStart || last.hasLyrics !== row.hasLyrics) {
      blocks.push({ hasLyrics: row.hasLyrics, rows: [row] })
    } else {
      last.rows.push(row)
    }
  }

  let verseNumber = 0
  let interludeNumber = 0

  return blocks.map((block, index) => {
    let label
    if (block.hasLyrics) {
      verseNumber += 1
      label = `Verse ${verseNumber}`
    } else if (index === 0) {
      label = 'Intro'
    } else if (index === blocks.length - 1) {
      label = 'Outro'
    } else {
      interludeNumber += 1
      label = `Interlude ${interludeNumber}`
    }
    return { label, rows: block.rows }
  })
}
```

Also update the `ExtractedRow` typedef comment at the top of `converter.js` to mention `sectionBreak`:

```js
/** @typedef {{ cells: ExtractedCell[], sectionBreak?: boolean }} ExtractedRow */
```

- [ ] **Step 4: Run the converter tests and update the snapshot**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: only the snapshot test fails with the new hints.

Then: `npx vitest run chrome-extention/converter.test.js -u`
Expected: PASS with the snapshot rewritten.

- [ ] **Step 5: Run the full test suite and lint**

Run: `npm test`
Expected: PASS (extension + src tests).

Run: `npx eslint chrome-extention/converter.js chrome-extention/converter.test.js`
Expected: no errors.

- [ ] **Step 6: Commit (only if the user approved commits)**

```bash
git add chrome-extention/converter.js chrome-extention/converter.test.js chrome-extention/snapshots/converter.test.js.snap
git commit -m "Split lyric hints across measures and honor ufret section breaks"
```

---

### Task 4: Content script uses the shared extractor

**Files:**
- Modify: `chrome-extention/content.js` (replace body)
- Modify: `chrome-extention/manifest.json`

**Interfaces:**
- Consumes: `extractFromDocument` from Task 2, exposed as a web-accessible module.
- Produces: unchanged message protocol `MYOL_EXTRACT` → `{ status, sheet? }`.

- [ ] **Step 1: Replace `chrome-extention/content.js`**

```js
let extractorPromise

function loadExtractor() {
  extractorPromise ??= import(chrome.runtime.getURL('extract.js'))
  return extractorPromise
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'MYOL_EXTRACT') return
  loadExtractor()
    .then(({ extractFromDocument }) => sendResponse(extractFromDocument(document)))
    .catch(() => sendResponse({ status: 'unsupported' }))
  return true
})
```

- [ ] **Step 2: Add the web-accessible resource to the manifest**

In `chrome-extention/manifest.json`, add a top-level `"web_accessible_resources"` key (place it after `"content_scripts"`):

```json
  "web_accessible_resources": [
    {
      "resources": ["extract.js"],
      "matches": ["*://*.ufret.jp/*"]
    }
  ]
```

- [ ] **Step 3: Verify JSON and lint**

Run: `node -e "JSON.parse(require('fs').readFileSync('chrome-extention/manifest.json','utf8')); console.log('manifest ok')"`
Expected: `manifest ok`.

Run: `npx eslint chrome-extention/content.js`
Expected: no errors.

- [ ] **Step 4: Manual smoke test (extension)**

Load unpacked `chrome-extention/` in a Chromium browser, open a ufret song page, open the popup, and confirm the status reports converted measures (no "コード譜を取得できませんでした"). Record the result. This step has no automated assertion.

- [ ] **Step 5: Commit (only if the user approved commits)**

```bash
git add chrome-extention/content.js chrome-extention/manifest.json
git commit -m "Load the shared extractor from the content script"
```

---

### Task 5: Local-save CLI

**Files:**
- Create: `scripts/import-ufret.mjs`
- Create: `scripts/import-ufret.test.js`
- Modify: `package.json` (add script)

**Interfaces:**
- Consumes: `extractFromHtml` (Task 2), `convertSheetToChordPro` (Task 3).
- Produces:
  - `sanitize(value: unknown): string`
  - `resolveOutputDir({ out?: string|null, env?: Record<string,string|undefined> }): string`
  - `buildFileName(sheet: { artist: string, title: string }, name?: string): string`
  - CLI: `node scripts/import-ufret.mjs <url> [--out DIR] [--name NAME] [--stdout]`

- [ ] **Step 1: Write the failing tests**

Create `scripts/import-ufret.test.js`:

```js
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { homedir } from 'node:os'
import { sanitize, resolveOutputDir, buildFileName } from './import-ufret.mjs'

describe('sanitize', () => {
  it('replaces filesystem-hostile characters with underscores', () => {
    expect(sanitize('a/b:c*d?"<>|e')).toBe('a_b_c_d_e')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitize('  name  ')).toBe('name')
  })
})

describe('resolveOutputDir', () => {
  it('prefers the explicit --out directory', () => {
    expect(resolveOutputDir({ out: '/tmp/x', env: { MYOL_SONGS_DIR: '/tmp/y' } })).toBe('/tmp/x')
  })

  it('uses MYOL_SONGS_DIR when set', () => {
    expect(resolveOutputDir({ out: null, env: { MYOL_SONGS_DIR: '/tmp/y' } })).toBe('/tmp/y')
  })

  it('falls back to ~/Music/myol', () => {
    expect(resolveOutputDir({ out: null, env: {} })).toBe(path.join(homedir(), 'Music', 'myol'))
  })
})

describe('buildFileName', () => {
  it('joins the sanitized artist and title', () => {
    expect(buildFileName({ artist: 'A/B', title: 'T:1' })).toBe('A_B_T_1.cho')
  })

  it('uses the provided name and appends .cho only when missing', () => {
    expect(buildFileName({ artist: 'A', title: 'T' }, 'my song')).toBe('my song.cho')
    expect(buildFileName({ artist: 'A', title: 'T' }, 'x.cho')).toBe('x.cho')
  })

  it('falls back to chordpro when artist and title are empty', () => {
    expect(buildFileName({ artist: '', title: '' })).toBe('chordpro.cho')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/import-ufret.test.js`
Expected: FAIL — cannot resolve `./import-ufret.mjs`.

- [ ] **Step 3: Implement `scripts/import-ufret.mjs`**

```js
#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFromHtml } from '../chrome-extention/extract.js'
import { convertSheetToChordPro } from '../chrome-extention/converter.js'

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept-Language': 'ja'
}

export function sanitize(value) {
  return String(value ?? '').replace(/[\\/:*?"<>|]+/g, '_').trim()
}

export function resolveOutputDir({ out, env = process.env } = {}) {
  if (out) return path.resolve(out)
  if (env.MYOL_SONGS_DIR) return path.resolve(env.MYOL_SONGS_DIR)
  return path.join(homedir(), 'Music', 'myol')
}

export function buildFileName(sheet, name) {
  const base = name
    ? name
    : [sanitize(sheet.artist), sanitize(sheet.title)].filter(Boolean).join('_') || 'chordpro'
  return base.endsWith('.cho') ? base : `${base}.cho`
}

function parseArgs(argv) {
  const args = { url: null, out: null, name: null, stdout: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out') args.out = argv[++i]
    else if (arg === '--name') args.name = argv[++i]
    else if (arg === '--stdout') args.stdout = true
    else if (!args.url) args.url = arg
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.url) {
    throw new Error('Usage: node scripts/import-ufret.mjs <url> [--out DIR] [--name NAME] [--stdout]')
  }

  const response = await fetch(args.url, { headers: DEFAULT_HEADERS, redirect: 'follow' })
  if (!response.ok) throw new Error(`Failed to fetch ${args.url}: HTTP ${response.status}`)

  const result = extractFromHtml(await response.text())
  if (result.status !== 'ok' || !result.sheet) {
    throw new Error('No ufret chord data found on this page')
  }

  const chordPro = convertSheetToChordPro(result.sheet)
  if (!chordPro.includes('{start_of_grid')) throw new Error('No chords found after conversion')

  if (args.stdout) {
    process.stdout.write(chordPro)
    return
  }

  const dir = resolveOutputDir({ out: args.out })
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, buildFileName(result.sheet, args.name))
  await writeFile(filePath, chordPro, 'utf8')
  process.stdout.write(`Saved: ${filePath}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
```

- [ ] **Step 4: Add an npm script**

In `package.json`, add to `"scripts"` after `"lint"`:

```json
    "import:ufret": "node scripts/import-ufret.mjs"
```

(The `scripts` object must remain valid JSON — add a comma after the `"lint"` line.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run scripts/import-ufret.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite and lint, then smoke-test the CLI**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: no errors.

Smoke test (writes only under `/tmp`, never the repo):

```bash
node scripts/import-ufret.mjs "https://www.ufret.jp/song.php?data=1028" --out /tmp/opencode/ufret-smoke
```

Expected: prints `Saved: /tmp/opencode/ufret-smoke/<something>.cho`.

Verify the output is parseable and non-empty without printing lyrics:

```bash
grep -c '{start_of_grid' /tmp/opencode/ufret-smoke/*.cho
```

Expected: a number >= 1.

- [ ] **Step 7: Commit (only if the user approved commits)**

```bash
git add scripts/import-ufret.mjs scripts/import-ufret.test.js package.json package-lock.json
git commit -m "Add ufret local import CLI"
```

---

### Task 6: Global `ufret-import` skill

**Files:**
- Create: `~/.claude/skills/ufret-import/SKILL.md`

**Interfaces:**
- Consumes: the CLI from Task 5.
- Produces: agent instructions only (no code).

- [ ] **Step 1: Create the skill directory**

Run: `mkdir -p ~/.claude/skills/ufret-import`

- [ ] **Step 2: Write `~/.claude/skills/ufret-import/SKILL.md`**

```markdown
---
name: ufret-import
description: Use when the user asks to save or fetch a chord sheet from ufret to local files (e.g. "ufret から保存", "この譜面をローカルに保存", "ufret の URL から .cho を作って")
---

# ufret Import

ufret の曲ページからコード譜を取り込み、ChordPro (`.cho`) としてローカルに保存する。

## 前提

- myol リポジトリの CLI を使う。リポジトリは `MYOL_HOME`、未設定時は
  `/home/youknow/Documents/workspace/myol`。
- 実在曲の歌詞・コード譜をリポジトリにコミットしない。保存先は既定でリポジトリ外
  (`~/Music/myol/`)。
- ufret は小節線を持たないため小節割りは推定。ズレは myol エディタで微調整する前提。

## 手順

1. 対象 URL を確定する。ユーザーが URL を出していなければ聞く。複数可。
2. 各 URL について次を実行する:
   ```bash
   node "${MYOL_HOME:-/home/youknow/Documents/workspace/myol}/scripts/import-ufret.mjs" "<url>"
   ```
   - 保存先を変える: `--out <dir>`
   - ファイル名を指定: `--name <name>`
   - 保存せず内容を確認: `--stdout`
3. 出力の `Saved: <path>` をそのままユーザーに報告する。
4. 小節割りは推定であること、微調整は myol エディタで行えることを一言添える。

## 失敗時

- `No ufret chord data found on this page` — ufret の曲ページでない、またはページ構造が
  変わった可能性。URL を確認する。
- `Failed to fetch ... HTTP <code>` — URL の綴りと公開状態を確認する。
```

- [ ] **Step 3: Verify the skill is discoverable**

Run: `head -5 ~/.claude/skills/ufret-import/SKILL.md`
Expected: the `---` frontmatter with `name: ufret-import`.

- [ ] **Step 4: Commit**

The skill lives outside the myol repository; there is nothing to commit here.

---

### Task 7: Documentation

**Files:**
- Modify: `AGENTS.md` (ufret import section + directory tree)
- Modify: `docs/chordpro.md` ("Importing from ufret" section)

**Interfaces:**
- Consumes: final behavior from Tasks 1–6.
- Produces: docs only.

- [ ] **Step 1: Update `AGENTS.md`**

In the directory tree under `scripts/`, note the new tool. In the
`### ufret インポート (chrome-extention/)` section, replace the bullets that describe
`content.js` DOM extraction with the raw-data description. Concretely:

- Change the `content.js` bullet to say it reads the page's embedded
  `ufret_chord_datas` via the shared `extract.js`, falling back to the rendered DOM.
- Add bullets: `extract.js` is the shared parser (HTML / document) used by both the
  extension and the CLI; `scripts/import-ufret.mjs` is the local-save CLI; the
  `~/.claude/skills/ufret-import` skill drives it; default output is `~/Music/myol/`.
- Add `scripts/import-ufret.mjs` to the directory tree with a one-line comment.

- [ ] **Step 2: Update `docs/chordpro.md`**

In `## Importing from ufret`, add that chords/lyrics come from the embedded
`ufret_chord_datas` raw data (exact `[chord]lyric` boundaries, spaces preserved),
that blank lines plus lyric-presence changes delimit sections, that a chord spanning
several measures has its lyric split across those measures, and that
`　/　` / `N.C.` are emitted as no-chord. Note the CLI
(`node scripts/import-ufret.mjs <url>`) as the non-extension path.

- [ ] **Step 3: Verify markdown changes read cleanly**

Run: `npx markdownlint-cli2 'docs/chordpro.md' 'AGENTS.md'` if available; otherwise
re-read the changed sections manually and confirm no broken code fences.
Expected: no structural errors.

- [ ] **Step 4: Commit (only if the user approved commits)**

```bash
git add AGENTS.md docs/chordpro.md
git commit -m "Document the raw ufret import path and local CLI"
```

---

### Task 8: Final verification

**Files:**
- No file changes expected. If a check fails, fix inline and re-run.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Confirm no real lyrics were committed**

Run: `git status --short`
Expected: only intended source/docs files; no `.cho` files under the repo, no fixtures
containing a real song's lyrics.

- [ ] **Step 4: End-to-end CLI check (outside the repo)**

Run:

```bash
node scripts/import-ufret.mjs "https://www.ufret.jp/song.php?data=1028" --stdout | grep -c '{start_of_grid'
```

Expected: a number >= 1 (ChordPro grid sections were produced). Do not write this output
into the repository.

- [ ] **Step 5: Report**

Summarize: files added/changed, test/lint results, the CLI's saved-path behavior, and the
skill location. State explicitly that measure division remains an estimate and is
adjustable in the myol editor.
