# ufret 譜面インポート Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chrome extension が ufret のコード譜を Grid 形式の ChordPro に変換し、`.cho` ダウンロードとクリップボードコピーで myol に渡せるようにする。

**Architecture:** DOM 掻き出し（`content.js`）と変換ロジック（`converter.js`）を分離し、変換を純粋関数の ES module に隔離して vitest でテストする。変換は popup 側で実行する（MV3 の content script は ES module を直接読めないが、拡張機能ページである popup は `<script type="module">` が使えるため）。ビルドステップは導入しない。

**Tech Stack:** Chrome Extension Manifest V3 / 素の JavaScript (ESM) / vitest / eslint

設計仕様: `docs/superpowers/specs/2026-07-28-ufret-import-design.md`

## Global Constraints

- 基準小節数 `M` は `{time:}` の分子から導出する。`{time:}` の出力は `4/4` 固定なので実質 `M = 4` だが、定数ではなく引数で受け渡す。
- `{tempo:}` は `120` 固定。ufret から BPM は取得できない。
- `{time:}` は `4/4` 固定。ufret に拍子情報は無い。
- `converter.js` は DOM の知識を持たない。`content.js` は ChordPro の知識を持たない。
- 型は JSDoc で記述する。`tsconfig.app.json` の `include` は `src/**` のみなので `vue-tsc` の型検査は `chrome-extention/` に及ばない。型注釈はドキュメントとしての価値のみで、正しさの担保はテストが負う。
- セクションラベルは `{start_of_grid label="..."}` 形式で出力する（`src/lib/chordpro/parser.ts` の `serializeChordPro` と同形式）。
- 歌詞に含まれる `|` は全角 `｜` に置換する（`{lyrics_hint}` の区切りと衝突するため）。
- commit 前に必ず `npm run lint` と `npm test` を実行する。

## File Structure

| ファイル | 責務 |
|---|---|
| `chrome-extention/converter.js` (新規) | `ExtractedSheet` → ChordPro 文字列。純粋関数のみ |
| `chrome-extention/converter.test.js` (新規) | 上記の vitest テスト |
| `chrome-extention/fixtures/ufret-yasashii-ano-ko.json` (新規・作成済み) | 実 DOM から取得した `ExtractedSheet`（37行） |
| `chrome-extention/content.js` (変更) | ufret DOM → `ExtractedSheet` |
| `chrome-extention/popup.js` (変更) | 変換 → ダウンロード / クリップボード |
| `chrome-extention/popup.html` (変更) | module script 化、コピーボタン追加 |
| `chrome-extention/manifest.json` (変更) | `clipboardWrite` 追加、対象を ufret に限定 |
| `.eslintrc.cjs` (変更) | `chrome-extention/**/*.js` に `chrome` グローバルを許可 |
| `package.json` (変更) | `lint` の `--ext` に `.js` を追加 |

---

### Task 1: 拡張機能の JS を lint 対象に入れる

以降のタスクで書く JavaScript が lint されるようにする。現状 `npm run lint` は `--ext .ts,.vue` なので `chrome-extention/` は一切検査されていない。

**Files:**
- Modify: `package.json`（`scripts.lint`）
- Modify: `.eslintrc.cjs`（`overrides` に追記）

**Interfaces:**
- Consumes: なし
- Produces: `npm run lint` が `chrome-extention/**/*.js` を検査する状態

- [ ] **Step 1: lint を .js にも広げて、現状の失敗を確認する**

`package.json` の `scripts.lint` を書き換える:

```json
"lint": "eslint . --ext .ts,.vue,.js"
```

- [ ] **Step 2: 実行して失敗することを確認する**

Run: `npm run lint`
Expected: FAIL。`chrome-extention/content.js` と `chrome-extention/popup.js` で `'chrome' is not defined  no-undef` が計 5 件出る。

（`.eslintignore` に `dist` / `node_modules` / `coverage` があるため、`lambda/presigned-url/dist` などは対象外。プロジェクト内の `.js` は `chrome-extention/` の 2 ファイルのみ。）

- [ ] **Step 3: chrome グローバルを許可する override を足す**

`.eslintrc.cjs` の `overrides` 配列に、既存の `**/*.test.ts` の override の**後ろ**に追記する:

```js
    {
      files: ['chrome-extention/**/*.js'],
      env: {
        browser: true,
        es2022: true
      },
      globals: {
        chrome: 'readonly'
      }
    }
```

- [ ] **Step 4: lint が通ることを確認する**

Run: `npm run lint`
Expected: PASS（エラー 0 件）

- [ ] **Step 5: コミット**

```bash
git add package.json .eslintrc.cjs
git commit -m "Lint the chrome extension sources"
```

---

### Task 2: 小節配分関数 distribute()

行内のコードへ小節数を歌詞文字数比で配分する純粋関数。最大剰余法で、各コードに最低 1 小節を保証する。

**Files:**
- Create: `chrome-extention/converter.js`
- Test: `chrome-extention/converter.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `distribute(weights: number[], total: number): number[]`
  - `weights` は各 1 以上（呼び出し側が `Math.max(len, 1)` で保証する）
  - 戻り値の合計は `total`（ただし `weights.length >= total` のときは全要素 1 で、合計は `weights.length`）

- [ ] **Step 1: 失敗するテストを書く**

`chrome-extention/converter.test.js` を新規作成:

```js
import { describe, it, expect } from 'vitest'
import { distribute } from './converter.js'

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
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: FAIL。`Failed to load ./converter.js`（ファイルがまだ存在しない）

- [ ] **Step 3: 最小の実装を書く**

`chrome-extention/converter.js` を新規作成:

```js
/**
 * ufret などから抽出した譜面データを ChordPro (Grid 形式) に変換する純粋関数群。
 * DOM の知識を持たないこと。
 */

/** @typedef {{ chord: string|null, text: string }} ExtractedCell */
/** @typedef {{ cells: ExtractedCell[] }} ExtractedRow */
/**
 * @typedef {Object} ExtractedSheet
 * @property {string} title
 * @property {string} artist
 * @property {number|null} capoOffset 原曲キーからの半音オフセット (ufret の capo 属性)
 * @property {ExtractedRow[]} rows
 */

/**
 * total 小節を weights の比で配分する (最大剰余法)。各要素に最低 1 小節を保証する。
 * weights の要素数が total 以上のときは配分せず全要素 1 を返す。
 *
 * @param {number[]} weights 各 1 以上
 * @param {number} total
 * @returns {number[]}
 */
export function distribute(weights, total) {
  const n = weights.length
  if (n === 0) return []
  if (n >= total) return weights.map(() => 1)

  const sum = weights.reduce((a, b) => a + b, 0)
  const extra = total - n
  const shares = weights.map(w => (extra * w) / sum)
  const counts = shares.map(share => 1 + Math.floor(share))

  let rest = total - counts.reduce((a, b) => a + b, 0)
  const byFraction = shares
    .map((share, index) => ({ fraction: share - Math.floor(share), index }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  for (let k = 0; rest > 0; k++, rest--) {
    counts[byFraction[k].index] += 1
  }

  return counts
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: PASS（7 tests）

- [ ] **Step 5: lint とテスト全体を実行する**

Run: `npm run lint && npm test`
Expected: どちらも PASS

- [ ] **Step 6: コミット**

```bash
git add chrome-extention/converter.js chrome-extention/converter.test.js
git commit -m "Add measure distribution for ufret import"
```

---

### Task 3: 行 → 小節の変換 convertRows()

抽出した行を小節列に変換する。仕様の 4 ルール（コード数 0 / `n >= M` / `n < M` 歌詞あり / `n < M` 歌詞なし）と、行頭のコード無しセルを前行にマージする処理を実装する。

**Files:**
- Modify: `chrome-extention/converter.js`
- Test: `chrome-extention/converter.test.js`

**Interfaces:**
- Consumes: `distribute(weights, total)`（Task 2）
- Produces:
  - `/** @typedef {{ chord: string, hint: string }} ConvertedMeasure */`
  - `/** @typedef {{ measures: ConvertedMeasure[], hasLyrics: boolean }} ConvertedRow */`
  - `convertRows(rows: ExtractedRow[], measuresPerRow: number): ConvertedRow[]`

- [ ] **Step 1: 失敗するテストを書く**

`chrome-extention/converter.test.js` の末尾に追記（先頭の import 文も `convertRows` を足す形に書き換える）:

```js
import { distribute, convertRows } from './converter.js'
```

```js
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
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: FAIL。`convertRows is not a function`

- [ ] **Step 3: 実装を書く**

`chrome-extention/converter.js` の `distribute` の下に追記:

```js
/** @typedef {{ chord: string, hint: string }} ConvertedMeasure */
/** @typedef {{ measures: ConvertedMeasure[], hasLyrics: boolean }} ConvertedRow */

/**
 * 行のセルを「コード + それに続くコード無しセルの歌詞」に畳む。
 * 行頭のコード無しセル (前行からの歌詞の続き) は leading として分離する。
 *
 * @param {ExtractedCell[]} cells
 * @returns {{ leading: string, groups: { chord: string, text: string }[] }}
 */
function groupCellsByChord(cells) {
  let leading = ''
  const groups = []
  for (const cell of cells) {
    if (cell.chord) {
      groups.push({ chord: cell.chord, text: cell.text })
    } else if (groups.length > 0) {
      groups[groups.length - 1].text += cell.text
    } else {
      leading += cell.text
    }
  }
  return { leading, groups }
}

/**
 * 抽出した行を小節列に変換する。
 *
 * @param {ExtractedRow[]} rows
 * @param {number} measuresPerRow 基準小節数 ({time:} の分子)
 * @returns {ConvertedRow[]}
 */
export function convertRows(rows, measuresPerRow) {
  /** @type {ConvertedRow[]} */
  const converted = []

  for (const row of rows) {
    const { leading, groups } = groupCellsByChord(row.cells)

    const trimmedLeading = leading.trim()
    if (trimmedLeading && converted.length > 0) {
      const previous = converted[converted.length - 1]
      const lastMeasure = previous.measures[previous.measures.length - 1]
      if (lastMeasure) {
        lastMeasure.hint += trimmedLeading
        previous.hasLyrics = true
      }
    }

    if (groups.length === 0) continue

    const hasLyrics = groups.some(group => group.text.trim().length > 0)
    const counts =
      groups.length >= measuresPerRow || !hasLyrics
        ? groups.map(() => 1)
        : distribute(groups.map(group => Math.max(group.text.trim().length, 1)), measuresPerRow)

    /** @type {ConvertedMeasure[]} */
    const measures = []
    groups.forEach((group, index) => {
      for (let repeat = 0; repeat < counts[index]; repeat++) {
        measures.push({ chord: group.chord, hint: repeat === 0 ? group.text.trim() : '' })
      }
    })

    converted.push({ measures, hasLyrics })
  }

  return converted
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: PASS（15 tests）

- [ ] **Step 5: lint とテスト全体を実行する**

Run: `npm run lint && npm test`
Expected: どちらも PASS

- [ ] **Step 6: コミット**

```bash
git add chrome-extention/converter.js chrome-extention/converter.test.js
git commit -m "Convert extracted ufret rows into grid measures"
```

---

### Task 4: セクション分割 splitSections()

歌詞の有無が切り替わる境目でセクションを分割し、`Intro` / `Verse N` / `Interlude N` / `Outro` のラベルを付ける。

**Files:**
- Modify: `chrome-extention/converter.js`
- Test: `chrome-extention/converter.test.js`

**Interfaces:**
- Consumes: `ConvertedRow`（Task 3）
- Produces:
  - `/** @typedef {{ label: string, rows: ConvertedRow[] }} ConvertedSection */`
  - `splitSections(rows: ConvertedRow[]): ConvertedSection[]`

- [ ] **Step 1: 失敗するテストを書く**

import 文に `splitSections` を追加し、テストを追記:

```js
import { distribute, convertRows, splitSections } from './converter.js'
```

```js
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
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: FAIL。`splitSections is not a function`

- [ ] **Step 3: 実装を書く**

`chrome-extention/converter.js` の `convertRows` の下に追記:

```js
/** @typedef {{ label: string, rows: ConvertedRow[] }} ConvertedSection */

/**
 * 歌詞の有無が切り替わる境目でセクションを分割し、ラベルを付ける。
 * ufret はセクション見出しを持たないため、これが唯一の構造の手がかりになる。
 *
 * @param {ConvertedRow[]} rows
 * @returns {ConvertedSection[]}
 */
export function splitSections(rows) {
  /** @type {{ hasLyrics: boolean, rows: ConvertedRow[] }[]} */
  const blocks = []
  for (const row of rows) {
    const last = blocks[blocks.length - 1]
    if (last && last.hasLyrics === row.hasLyrics) {
      last.rows.push(row)
    } else {
      blocks.push({ hasLyrics: row.hasLyrics, rows: [row] })
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

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: PASS（20 tests）

- [ ] **Step 5: lint とテスト全体を実行する**

Run: `npm run lint && npm test`
Expected: どちらも PASS

- [ ] **Step 6: コミット**

```bash
git add chrome-extention/converter.js chrome-extention/converter.test.js
git commit -m "Split imported rows into labelled grid sections"
```

---

### Task 5: ChordPro 組み立て convertSheetToChordPro() と実曲での検証

メタデータを付けて ChordPro 文字列を組み立てる。実 DOM から取った 37 行のフィクスチャで検証し、生成物を myol の `parseChordPro()` に通して読めることを確認する。

**Files:**
- Modify: `chrome-extention/converter.js`
- Test: `chrome-extention/converter.test.js`
- Add: `chrome-extention/fixtures/ufret-yasashii-ano-ko.json`（作成済み・未コミット。スピッツ「優しいあの子」の実 DOM から抽出した `ExtractedSheet`、37 行、`capoOffset: -2`）

**Interfaces:**
- Consumes: `convertRows`（Task 3）, `splitSections`（Task 4）
- Produces: `convertSheetToChordPro(sheet: ExtractedSheet, options?: { tempo?: number, time?: string }): string`
  - `options.tempo` 既定 `120`、`options.time` 既定 `'4/4'`

- [ ] **Step 1: 失敗するテストを書く**

import 文を書き換え、フィクスチャと myol のパーサを読み込むテストを追記:

```js
import { distribute, convertRows, splitSections, convertSheetToChordPro } from './converter.js'
import { parseChordPro } from '@/lib/chordpro/parser'
import sheet from './fixtures/ufret-yasashii-ano-ko.json'
```

```js
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
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: FAIL。`convertSheetToChordPro is not a function`

- [ ] **Step 3: 実装を書く**

`chrome-extention/converter.js` の末尾に追記:

```js
/**
 * 抽出した譜面を Grid 形式の ChordPro 文字列に変換する。
 *
 * ufret は BPM も拍子も持たないため tempo/time は既定値を置く。myol 側で直す前提。
 *
 * @param {ExtractedSheet} sheet
 * @param {{ tempo?: number, time?: string }} [options]
 * @returns {string}
 */
export function convertSheetToChordPro(sheet, options = {}) {
  const tempo = options.tempo ?? 120
  const time = options.time ?? '4/4'
  const measuresPerRow = Number(time.split('/')[0])

  const lines = [`{title: ${sheet.title ?? ''}}`, `{artist: ${sheet.artist ?? ''}}`]

  // ufret の capo 属性は原曲キーからの半音オフセット。負値がカポ位置に対応する。
  const capo = sheet.capoOffset ? -sheet.capoOffset : 0
  if (capo > 0) lines.push(`{capo: ${capo}}`)

  lines.push(`{tempo: ${tempo}}`, `{time: ${time}}`, '')

  for (const section of splitSections(convertRows(sheet.rows, measuresPerRow))) {
    lines.push(`{start_of_grid label="${section.label}"}`)
    for (const row of section.rows) {
      if (row.hasLyrics) {
        const hints = row.measures.map(measure => measure.hint.replace(/\|/g, '｜'))
        lines.push(`{lyrics_hint: ${hints.join(' | ')}}`)
      }
      lines.push(`| ${row.measures.map(measure => measure.chord).join(' | ')} |`)
    }
    lines.push('{end_of_grid}', '')
  }

  return lines.join('\n')
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run chrome-extention/converter.test.js`
Expected: PASS（27 tests）

もし `parsed.capo` などメタデータの型が期待と違って落ちる場合は、`src/lib/chordpro/parser.ts` の実際のパース結果を確認し、**テストの期待値ではなくパーサの実装に合わせる**こと（拡張機能の出力が myol で読めることがこのテストの目的）。

- [ ] **Step 5: lint とテスト全体を実行する**

Run: `npm run lint && npm test`
Expected: どちらも PASS

- [ ] **Step 6: コミット**

```bash
git add chrome-extention/converter.js chrome-extention/converter.test.js chrome-extention/fixtures/ufret-yasashii-ano-ko.json
git commit -m "Assemble grid ChordPro from an extracted ufret sheet"
```

---

### Task 6: content script を ExtractedSheet 抽出に置き換える

`content.js` が ChordPro を組み立てるのをやめ、`ExtractedSheet` を返すだけにする。あわせて manifest を ufret 限定にする。

**Files:**
- Modify: `chrome-extention/content.js`（全面書き換え）
- Modify: `chrome-extention/manifest.json`

**Interfaces:**
- Consumes: `ExtractedSheet` の型定義（Task 2 で `converter.js` に記述済み）
- Produces: `chrome.tabs.sendMessage(tabId, { type: 'MYOL_EXTRACT' })` のレスポンスが `{ sheet: ExtractedSheet | null }`

- [ ] **Step 1: content.js を書き換える**

`chrome-extention/content.js` の内容を全て以下に置き換える:

```js
/**
 * ufret のコード譜 DOM から ExtractedSheet を抽出する。
 * ChordPro の知識は持たない (変換は popup 側の converter.js が行う)。
 */

function extractSheet() {
  const root = document.querySelector('#my-chord-data')
  if (!root) return null

  const title = (document.querySelector('.show_name')?.textContent || document.title || '').trim()
  const artist = (document.querySelector('.show_artist')?.textContent || '').replace(/\s+/g, ' ').trim()

  const capoAttr = root.getAttribute('capo')
  const capoOffset = capoAttr === null || capoAttr.trim() === '' || Number.isNaN(Number(capoAttr))
    ? null
    : Number(capoAttr)

  const rows = Array.from(root.querySelectorAll('.chord-row')).map((row) => ({
    cells: Array.from(row.querySelectorAll('p.chord')).map((cell) => ({
      chord: (cell.querySelector('rt')?.textContent || '').trim() || null,
      text: Array.from(cell.querySelectorAll('.mejiowvnz .col'))
        .map((col) => col.textContent || '')
        .join('')
    }))
  }))

  if (rows.length === 0) return null

  return { title, artist, capoOffset, rows }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'MYOL_EXTRACT') {
    sendResponse({ sheet: extractSheet() })
  }
})
```

- [ ] **Step 2: manifest を ufret 限定にし clipboardWrite を足す**

`chrome-extention/manifest.json` の内容を全て以下に置き換える。

content script は ufret でしか動かないため、`<all_urls>` で全ページに注入するのをやめて対象を絞る（最小権限。`clipboardWrite` は Task 7 のコピー機能で使う）:

```json
{
  "manifest_version": 3,
  "name": "myol ChordPro Extractor",
  "version": "0.2.0",
  "description": "Extract chord sheets into ChordPro for myol.",
  "permissions": ["activeTab", "downloads", "clipboardWrite"],
  "host_permissions": ["*://*.ufret.jp/*"],
  "action": {
    "default_title": "Extract ChordPro",
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["*://*.ufret.jp/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 3: lint とテスト全体を実行する**

Run: `npm run lint && npm test`
Expected: どちらも PASS

（この時点で popup.js はまだ旧レスポンス形式 `{ text, title, artist }` を前提にしているため、拡張機能としては一時的に動かない。Task 7 で解消する。）

- [ ] **Step 4: コミット**

```bash
git add chrome-extention/content.js chrome-extention/manifest.json
git commit -m "Extract a structured sheet from ufret instead of inline ChordPro"
```

---

### Task 7: popup で変換し、ダウンロードとクリップボードコピーを提供する

popup を ES module 化して `converter.js` を import し、開いた時点で自動抽出・変換して、ダウンロードとコピーの 2 導線を出す。

**Files:**
- Modify: `chrome-extention/popup.html`
- Modify: `chrome-extention/popup.js`（全面書き換え）

**Interfaces:**
- Consumes: `convertSheetToChordPro(sheet, options?)`（Task 5）、`{ sheet }` レスポンス（Task 6）
- Produces: なし（末端）

- [ ] **Step 1: popup.html を書き換える**

`chrome-extention/popup.html` の内容を全て以下に置き換える。`type="module"` が `converter.js` の import に必須:

```html
<!doctype html>
<html>

<head>
  <meta charset="utf-8" />
  <title>myol</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      width: 260px;
      margin: 12px;
    }

    button {
      width: 100%;
      padding: 8px 10px;
      font-size: 14px;
      cursor: pointer;
      margin-bottom: 6px;
    }

    button:disabled {
      cursor: default;
      opacity: 0.5;
    }

    #status {
      margin-top: 8px;
      font-size: 12px;
      color: #444;
      white-space: pre-wrap;
    }
  </style>
</head>

<body>
  <button id="download" disabled>.cho をダウンロード</button>
  <button id="copy" disabled>クリップボードにコピー</button>
  <div id="status"></div>
  <script type="module" src="popup.js"></script>
</body>

</html>
```

- [ ] **Step 2: popup.js を書き換える**

`chrome-extention/popup.js` の内容を全て以下に置き換える:

```js
import { convertSheetToChordPro } from './converter.js'

const downloadButton = document.getElementById('download')
const copyButton = document.getElementById('copy')
const statusEl = document.getElementById('status')

let chordPro = ''
let baseName = 'chordpro'

function setStatus(message) {
  statusEl.textContent = message
}

function sanitize(value) {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim()
}

function requestSheet(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'MYOL_EXTRACT' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null)
        return
      }
      resolve(response?.sheet ?? null)
    })
  })
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    setStatus('アクティブなタブが見つかりません。')
    return
  }

  const sheet = await requestSheet(tab.id)
  if (!sheet) {
    setStatus('このページからコード譜を取得できませんでした。')
    return
  }

  chordPro = convertSheetToChordPro(sheet)
  baseName = [sanitize(sheet.artist || ''), sanitize(sheet.title || '')].filter(Boolean).join('_') || 'chordpro'

  setStatus(`${sheet.title || '(無題)'} / ${sheet.artist || '(不明)'}\n${sheet.rows.length} 行を変換しました。`)

  downloadButton.disabled = false
  copyButton.disabled = false
}

downloadButton.addEventListener('click', () => {
  const blob = new Blob([chordPro], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  chrome.downloads.download({ url, filename: `${baseName}.cho`, saveAs: true }, () => {
    URL.revokeObjectURL(url)
    setStatus('ダウンロードしました。')
  })
})

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(chordPro)
    setStatus('クリップボードにコピーしました。')
  } catch {
    setStatus('コピーに失敗しました。')
  }
})

void load()
```

- [ ] **Step 3: lint とテスト全体を実行する**

Run: `npm run lint && npm test`
Expected: どちらも PASS

- [ ] **Step 4: 実機で動作確認する**

1. Chrome/Chromium で `chrome://extensions` を開き、デベロッパーモードを ON
2. 「パッケージ化されていない拡張機能を読み込む」で `chrome-extention/` を選択
3. `https://www.ufret.jp/song.php?data=52294` を開き、コード譜が描画されるまで待つ
4. 拡張機能アイコンをクリックし、`優しいあの子 / スピッツ` と `37 行を変換しました。` が出ることを確認
5. 「クリップボードにコピー」を押し、myol の新規作成画面のテキスト欄に貼り付けて、Grid が表示されることを確認
6. 「.cho をダウンロード」で `スピッツ_優しいあの子.cho` が保存されることを確認

myol の起動方法（`docs/superpowers/specs` の検証手順に準拠）:

```bash
VITE_API_ENDPOINT="" VITE_S3_BUCKET="" npm run dev -- --port 5175 --strictPort
```

ログインは 4 桁パスコード（`src/stores/auth.ts` の定数）。

- [ ] **Step 5: コミット**

```bash
git add chrome-extention/popup.html chrome-extention/popup.js
git commit -m "Convert and hand off the imported sheet from the popup"
```

---

### Task 8: ドキュメント更新

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/chordpro.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: AGENTS.md にディレクトリと機能を追記する**

`AGENTS.md` の「ディレクトリ構造」のコードブロック内、`scripts/` の行の下に追記:

```
chrome-extention/       # ufret からコード譜を取り込む Chrome 拡張 (MV3)
```

同ファイルの「主要機能」節の末尾に追記:

```markdown
### ufret インポート (`chrome-extention/`)
- `content.js` が ufret の DOM から `ExtractedSheet` を抽出
- `converter.js` が Grid 形式の ChordPro に変換 (純粋関数・`converter.test.js` でテスト)
- popup から `.cho` ダウンロード / クリップボードコピー
- ufret には小節線・セクション見出し・BPM が無いため、小節割りは行内のコード数と
  歌詞文字数から推定する。tempo は 120 固定で myol 側で直す
- 設計: `docs/superpowers/specs/2026-07-28-ufret-import-design.md`
```

- [ ] **Step 2: docs/chordpro.md に生成元を明記する**

`docs/chordpro.md` の「Automatic Measure Assignment」節の直後に追記:

```markdown
## Importing from ufret

The Chrome extension in `chrome-extention/` generates Extended Grid ChordPro
directly from a ufret page. Since ufret exposes neither bar lines nor section
headings, measures are inferred: a row with at least `M` chords becomes one
measure per chord, and a shorter row with lyrics is padded to `M` measures in
proportion to the character count of each chord's lyrics. Sections are split
where rows switch between having lyrics and not, yielding `Intro`, `Verse N`,
`Interlude N` and `Outro` labels.

`{tempo:}` is always emitted as 120 because ufret does not publish BPM.
```

- [ ] **Step 3: lint とテスト全体を実行する**

Run: `npm run lint && npm test`
Expected: どちらも PASS

- [ ] **Step 4: コミット**

```bash
git add AGENTS.md docs/chordpro.md
git commit -m "Document the ufret import path"
```

---

## 完了条件

- `npm run lint` と `npm test` が通る
- 拡張機能を読み込んだ状態で ufret の曲ページから `.cho` とクリップボードの両方で取り出せる
- 取り出した ChordPro を myol の新規作成画面に貼ると Grid が表示され、再生できる

## 既知の制約（このプランでは対応しない）

- `src/lib/chords/dictionary.ts` に `A#` などシャープ / フラット根音のエントリが無く、
  ufret が出すそれらのコードはダイアグラムが表示されない（別途対応）
- `{tempo: 120}` 固定のため、再生速度は毎回 myol 側で直す必要がある
- セクションラベルは `Verse N` / `Interlude N` の機械的なもので、A メロ / サビの区別は付かない
- ufret 以外のサイトには対応しない
