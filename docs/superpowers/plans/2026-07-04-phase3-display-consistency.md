# Phase 3: 表示・ハイライトの一貫性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「現在小節」の数え方を1つにし（歌詞のみセクションを再生カウントから除外）、セル表示・バー表示を `lib/chordpro` の単一実装に統一し、ビジュアルエディタに歌詞ヒント入力 UI を追加する。未使用ビュー（LyricsView / SongKaraokeView）と4通り目まであったハイライト計算の残骸を削除する。

**Architecture:** Phase 1/2 の結果、`Measure.cells` にバー種別セルは存在しない（境界バーは `startBar`/`endBar`）。よって表示系のバー分岐はデッドコードであり、`GridCell` 型を `'chord' | 'noChord' | 'empty' | 'repeat'` に絞った上で、セル文字・バー記号の描画を新設の `lib/chordpro/cellDisplay.ts` に集約する。小節数のカウントはグリッドのみとし、歌詞のみセクションは Detail ページで静的テキスト描画する。

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vitest。新規依存なし。

**Spec:** `docs/superpowers/specs/2026-07-03-consistency-refactor-design.md`（Phase 3 節）

**Branch:** `refactor/phase3-display-consistency`（main から作成）

## Global Constraints

- `.ts` ファイルはタブインデント・シングルクォート・セミコロンなし。`.vue` ファイルは各ファイルの既存スタイル（2スペース）
- コミット前に必ず `npm run lint` と `npm run test` を実行し、両方成功を確認する
- 命名は `lyricsHint`（モデル/変数）と `lyrics_hint`（ディレクティブ）の2つに統一。`hint` 単独名を残さない
- 保存形式・パース結果（`ParsedSong` 構造）は変更しない（Phase 3 は表示層のみ。例外は `GridCell` 型のデッドメンバー削除で、これはモデル上すでに生成され得ない値の型表明の整理）
- 編集系のミューテーションは引き続きストアアクション経由のみ（Phase 2 の規律を崩さない）

---

### Task 1: 未使用ビューと専用 composable の削除

**Files:**
- Delete: `src/components/song/LyricsView.vue`
- Delete: `src/components/song/SongKaraokeView.vue`
- Delete: `src/components/song/composables/useKaraokeScroll.ts` + `useKaraokeScroll.test.ts`
- Delete: `src/components/song/composables/useLyricsHighlight.ts` + `useLyricsHighlight.test.ts`

**Interfaces:**
- Consumes: なし（全ファイル参照ゼロ — 監査済み）
- Produces: 「現在小節」の計算モデルが GridView の1系統のみになったコードベース。`useGridCellHighlight.getKaraokeCellClass` は未使用化するが Task 3 でファイルごと削除するため本タスクでは触らない

- [ ] **Step 1: 参照ゼロを確認してから削除**

```bash
grep -rn "LyricsView\|SongKaraokeView\|useKaraokeScroll\|useLyricsHighlight" src/
```
Expected: 定義ファイル自身のみヒット（importer ゼロ）。

```bash
git rm src/components/song/LyricsView.vue src/components/song/SongKaraokeView.vue
git rm src/components/song/composables/useKaraokeScroll.ts src/components/song/composables/useKaraokeScroll.test.ts
git rm src/components/song/composables/useLyricsHighlight.ts src/components/song/composables/useLyricsHighlight.test.ts
```

- [ ] **Step 2: ビルド + lint + 全テスト + コミット**

```bash
npm run build && npm run lint && npm run test
git add -A src/
git commit -m "Remove unused lyrics and karaoke views"
```

---

### Task 2: 歌詞のみセクションを再生カウントから除外し、静的テキストとして描画

**Files:**
- Modify: `src/composables/useChordProDocument.ts`（totalMeasures / sectionMeasureOffsets をグリッドのみカウントに）
- Modify: `src/composables/useChordProDocument.test.ts`
- Modify: `src/pages/SongDetailPage.vue`（歌詞セクションの静的描画ブロック追加）

**Interfaces:**
- Consumes: `ParsedSong` / `LyricsSection`
- Produces: `totalMeasures` = 全グリッドセクションの小節数の和（最低1）。`sectionMeasureOffsets[i]` = セクション i より前のグリッド小節数の累積（歌詞・タブは 0 加算）。再生時間・ハイライト・小節カウンタがすべて「見えるグリッド小節」とだけ対応する
- 背景: 現状は歌詞のみセクションの行数を小節としてカウントするが Detail ページはそれを描画しないため、混在曲で「見えない小節」がハイライトずれ・再生時間の水増しを生む（監査 Top 4）

- [ ] **Step 1: 失敗するテストを書く**

`src/composables/useChordProDocument.test.ts` に追加（既存の describe 内。import は現状のまま）:

```ts
	it('counts only grid measures, excluding lyrics-only sections', () => {
		const content = ref(`{start_of_grid}
|| C . | G . ||
{end_of_grid}

{start_of_verse}
just text line one
just text line two
just text line three
{end_of_verse}

{start_of_grid}
|| Am . | F . ||
{end_of_grid}
`)
		const { totalMeasures, sectionMeasureOffsets } = useChordProDocument({ content })
		expect(totalMeasures.value).toBe(4)
		expect(sectionMeasureOffsets.value).toEqual([0, 2, 2])
	})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/composables/useChordProDocument.test.ts`
Expected: FAIL（現状は totalMeasures 7、offsets [0, 2, 5]）

- [ ] **Step 3: 実装**

`useChordProDocument.ts` の `totalMeasures` と `sectionMeasureOffsets` から `lyrics` 分岐を削除:

```ts
	const totalMeasures = computed(() => {
		if (!parsedSong.value) return 1
		let count = 0
		for (const section of parsedSong.value.sections) {
			if (section.content.kind === 'grid') {
				count += countMeasuresInGrid(section.content as GridSection)
			}
		}
		return Math.max(count, 1)
	})

	const sectionMeasureOffsets = computed(() => {
		if (!parsedSong.value) return []
		const offsets: number[] = []
		let offset = 0
		for (const section of parsedSong.value.sections) {
			offsets.push(offset)
			if (section.content.kind === 'grid') {
				offset += countMeasuresInGrid(section.content as GridSection)
			}
		}
		return offsets
	})
```

import から `LyricsSection` を削除（未使用化）。既存テストで歌詞行をカウントに含める期待をしているものがあれば、本仕様（グリッドのみ）に合わせて期待値を更新する。

- [ ] **Step 4: SongDetailPage に歌詞セクションの静的描画を追加**

script に helper を追加（import に `LyricsLine`, `Section` 型を追加。`@/lib/chordpro/types` から）:

```ts
function lyricsLines(section: Section): LyricsLine[] {
  return section.content.kind === 'lyrics' ? section.content.lines : []
}

function lyricsLineText(line: LyricsLine): string {
  return line.segments.map(segment => segment.text).join('')
}
```

template の tab セクションブロックの後に追加:

```vue
              <!-- Lyrics-only sections (static text, no playback timing) -->
              <div
                v-if="section.content.kind === 'lyrics'"
                class="lyrics-section"
              >
                <div v-if="section.label" class="section-label">{{ section.label }}</div>
                <p
                  v-for="(line, lineIndex) in lyricsLines(section)"
                  :key="lineIndex"
                  class="lyrics-line"
                >
                  {{ lyricsLineText(line) || ' ' }}
                </p>
              </div>
```

style に追加:

```css
.lyrics-section {
  margin-bottom: var(--spacing-xl);
}

.lyrics-line {
  color: var(--color-text-secondary);
  line-height: 1.8;
  margin: 0;
}
```

- [ ] **Step 5: テスト + lint + コミット**

```bash
npx vitest run src/composables/useChordProDocument.test.ts
npm run lint && npm run test
git add src/composables/useChordProDocument.ts src/composables/useChordProDocument.test.ts src/pages/SongDetailPage.vue
git commit -m "Count only grid measures for playback and render lyrics sections statically"
```

---

### Task 3: セル・バー表示の lib 統一と GridCell 型の整理

**Files:**
- Create: `src/lib/chordpro/cellDisplay.ts` + `cellDisplay.test.ts`
- Modify: `src/lib/chordpro/types.ts`（GridCell 型の絞り込み）
- Modify: `src/lib/chordpro/parser.ts`（cellToString のバー case 削除）
- Modify: `src/components/song/composables/useGridViewState.ts`（`measureHints` → `lyricsHints` リネーム + グループへの bar 情報付与）+ test
- Modify: `src/components/song/GridView.vue`（lib 使用・`hint` 命名排除・リピート記号表示）
- Modify: `src/components/song/GridMeasureItem.vue`（ローカル表示関数を lib に置換）
- Modify: `src/components/song/GridMeasureList.vue`（バー区切りを `gridBarGlyphs` に置換）
- Delete: `src/composables/useGridCellDisplay.ts` + `.test.ts`、`src/composables/useGridCellHighlight.ts` + `.test.ts`

**Interfaces:**
- Produces（`src/lib/chordpro/cellDisplay.ts`）:
  - `cellGlyph(cell: GridCell): string` — chord: value / noChord: `/` / empty: `·` / repeat: value or `%`
  - `cellKind(cell: GridCell): 'chord' | 'empty' | 'repeat'`（noChord は 'empty' 扱い — 既存のクラス割当と同一）
  - `boundaryGlyph(endBar: Measure['endBar'], startBar: Measure['startBar'], fallback: string): string` — `:║:` / `:║` / `║.`（barEnd+repeatStart は `║. ║:`）/ `║:` / fallback
  - `gridBarGlyphs(measures: Measure[]): string[]` — 長さ `measures.length + 1`。先頭・末尾 fallback `║`、中間 `│`
- `GridCell.type` は `'chord' | 'noChord' | 'empty' | 'repeat'` に絞る（バー種別はモデル上 Phase 1 以降生成されない。境界バーは `Measure.startBar/endBar` が正）
- `useGridViewState` の返り値: `lyricsHints`（旧 `measureHints`）。`cellsWithMeasures` は不変
- GridView の `MeasureGroup` は `{ measureIndex, cells, isCurrent, lyricsHint, startBar, endBar }` になり、リピート記号（`║:` / `:║` / `║.`）を小節ボックス内に表示する

- [ ] **Step 1: 失敗するテストを書く（lib）**

`src/lib/chordpro/cellDisplay.test.ts` を作成:

```ts
import { describe, it, expect } from 'vitest'
import { cellGlyph, cellKind, boundaryGlyph, gridBarGlyphs } from './cellDisplay'
import type { Measure } from './types'

describe('cellGlyph / cellKind', () => {
	it('maps cell types to glyphs', () => {
		expect(cellGlyph({ type: 'chord', value: 'G' })).toBe('G')
		expect(cellGlyph({ type: 'noChord' })).toBe('/')
		expect(cellGlyph({ type: 'empty' })).toBe('·')
		expect(cellGlyph({ type: 'repeat', value: '%' })).toBe('%')
	})

	it('maps cell types to kinds', () => {
		expect(cellKind({ type: 'chord', value: 'G' })).toBe('chord')
		expect(cellKind({ type: 'noChord' })).toBe('empty')
		expect(cellKind({ type: 'empty' })).toBe('empty')
		expect(cellKind({ type: 'repeat', value: '%' })).toBe('repeat')
	})
})

describe('boundaryGlyph / gridBarGlyphs', () => {
	it('renders repeat and end bars distinctly', () => {
		expect(boundaryGlyph(undefined, undefined, '│')).toBe('│')
		expect(boundaryGlyph('repeatEnd', undefined, '│')).toBe(':║')
		expect(boundaryGlyph(undefined, 'repeatStart', '║')).toBe('║:')
		expect(boundaryGlyph('repeatEnd', 'repeatStart', '│')).toBe(':║:')
		expect(boundaryGlyph('barEnd', undefined, '║')).toBe('║.')
		expect(boundaryGlyph('barEnd', 'repeatStart', '│')).toBe('║. ║:')
	})

	it('builds a glyph per boundary for a measure list', () => {
		const measures: Measure[] = [
			{ cells: [{ type: 'chord', value: 'G' }], startBar: 'repeatStart' },
			{ cells: [{ type: 'chord', value: 'C' }] },
			{ cells: [{ type: 'chord', value: 'D' }], endBar: 'repeatEnd' }
		]
		expect(gridBarGlyphs(measures)).toEqual(['║:', '│', '│', ':║'])
	})

	it('returns the outer bars for an empty list', () => {
		expect(gridBarGlyphs([])).toEqual(['║'])
	})
})
```

Run: `npx vitest run src/lib/chordpro/cellDisplay.test.ts` → FAIL（モジュール未作成）

- [ ] **Step 2: lib 実装**

`src/lib/chordpro/cellDisplay.ts`:

```ts
import type { GridCell, Measure } from './types'

export function cellGlyph(cell: GridCell): string {
	switch (cell.type) {
		case 'noChord': return '/'
		case 'empty': return '·'
		case 'repeat': return cell.value || '%'
		case 'chord': return cell.value || ''
	}
}

export function cellKind(cell: GridCell): 'chord' | 'empty' | 'repeat' {
	switch (cell.type) {
		case 'chord': return 'chord'
		case 'repeat': return 'repeat'
		default: return 'empty'
	}
}

export function boundaryGlyph(
	endBar: Measure['endBar'],
	startBar: Measure['startBar'],
	fallback: string
): string {
	if (endBar === 'repeatEnd' && startBar === 'repeatStart') return ':║:'
	if (endBar === 'barEnd') return startBar === 'repeatStart' ? '║. ║:' : '║.'
	if (endBar === 'repeatEnd') return ':║'
	if (startBar === 'repeatStart') return '║:'
	return fallback
}

export function gridBarGlyphs(measures: Measure[]): string[] {
	const glyphs: string[] = []
	for (let i = 0; i <= measures.length; i += 1) {
		const endBar = i > 0 ? measures[i - 1]?.endBar : undefined
		const startBar = i < measures.length ? measures[i]?.startBar : undefined
		const fallback = i === 0 || i === measures.length ? '║' : '│'
		glyphs.push(boundaryGlyph(endBar, startBar, fallback))
	}
	return glyphs
}
```

Run: `npx vitest run src/lib/chordpro/cellDisplay.test.ts` → PASS

- [ ] **Step 3: GridCell 型の絞り込みと parser の追随**

`src/lib/chordpro/types.ts`:

```ts
export interface GridCell {
	type: 'chord' | 'noChord' | 'empty' | 'repeat'
	value?: string
}
```

`src/lib/chordpro/parser.ts` の `cellToString` からバー種別 case（`bar` / `barDouble` / `barEnd` / `repeatStart` / `repeatEnd` / `repeatBoth`）と `default` を削除し、網羅 switch にする:

```ts
function cellToString(cell: GridCell): string {
	switch (cell.type) {
		case 'noChord': return '/'
		case 'empty': return '.'
		case 'repeat': return cell.value || '%'
		case 'chord': return cell.value || ''
	}
}
```

- [ ] **Step 4: useGridViewState のリネーム（`lyricsHints`）**

`src/components/song/composables/useGridViewState.ts`: `measureHints` を `lyricsHints` にリネーム（computed 名・return エントリ）。`useGridViewState.test.ts` の参照も追随（`measureHints` → `lyricsHints`）。

- [ ] **Step 5: GridView.vue の書き換え**

script の該当部分を置換（imports から `useGridCellDisplay`/`useGridCellHighlight` を除去し lib を使用。`hint` 命名を `lyricsHint` に統一。グループにバー情報を付与）:

```ts
import { computed } from 'vue'
import { useGridViewState, type CellWithMeasure } from '@/components/song/composables/useGridViewState'
import { cellGlyph, cellKind } from '@/lib/chordpro/cellDisplay'
import type { Section, GridSection } from '@/lib/chordpro/types'
```

```ts
const { lyricsHints, cellsWithMeasures } = useGridViewState({
  grid: gridContent,
  currentMeasure: computed(() => (props.isPlaying ? props.currentMeasure : -1)),
  measureOffset: computed(() => props.measureOffset)
})

interface MeasureGroup {
  measureIndex: number
  cells: CellWithMeasure[]
  isCurrent: boolean
  lyricsHint: string
  startBar?: 'repeatStart'
  endBar?: 'repeatEnd' | 'barEnd'
}

const measureRows = computed(() =>
  cellsWithMeasures.value.map((row) => {
    const groups: MeasureGroup[] = []

    row.forEach((cell) => {
      const lastGroup = groups[groups.length - 1]
      if (!lastGroup || lastGroup.measureIndex !== cell.measureIndex) {
        const localIndex = cell.measureIndex - props.measureOffset
        const measure = gridContent.measures[localIndex]
        groups.push({
          measureIndex: cell.measureIndex,
          cells: [cell],
          isCurrent: cell.isCurrentMeasure,
          lyricsHint: lyricsHints.value[localIndex] || '',
          startBar: measure?.startBar,
          endBar: measure?.endBar
        })
        return
      }
      lastGroup.cells.push(cell)
      if (cell.isCurrentMeasure) {
        lastGroup.isCurrent = true
      }
    })

    return groups
  })
)

function getCellClass(cell: CellWithMeasure): string[] {
  const classes = [`grid-${cellKind(cell)}`]
  if (cell.isCurrentMeasure && cell.type === 'chord') {
    classes.push('current-measure')
  }
  return classes
}
```

template の変更点:
- `getCellDisplay(cell)` → `cellGlyph(cell)`
- `group.hint` → `group.lyricsHint`（2箇所）
- `grid-measure-body` の直前・直後にリピート記号マーカーを追加:

```vue
              <div class="grid-measure-body">
                <span v-if="group.startBar" class="grid-bar-mark">║:</span>
                <div
                  v-for="(cell, cellIndex) in group.cells"
                  :key="cellIndex"
                  class="grid-cell"
                  :class="getCellClass(cell)"
                >
                  <span class="grid-cell-text">{{ cellGlyph(cell) }}</span>
                </div>
                <span v-if="group.endBar" class="grid-bar-mark">{{ group.endBar === 'repeatEnd' ? ':║' : '║.' }}</span>
              </div>
```

style に追加:

```css
.grid-bar-mark {
  color: var(--color-grid-bar);
  font-weight: 600;
  align-self: center;
}
```

- [ ] **Step 6: GridMeasureItem / GridMeasureList の追随**

`GridMeasureItem.vue`: ローカルの `getCellClass` / `getCellDisplay` 関数を削除し、lib を使用:

```ts
import { cellGlyph, cellKind } from '@/lib/chordpro/cellDisplay'
```

```ts
function getCellClass(cell: GridCell): string {
  return `cell-${cellKind(cell)}`
}
```

template の `{{ getCellDisplay(cell) }}` → `{{ cellGlyph(cell) }}`。

`GridMeasureList.vue`: ハードコードの `║` / `│` 区切りを `gridBarGlyphs` に置換。script に追加:

```ts
import { computed } from 'vue'
import { gridBarGlyphs } from '@/lib/chordpro/cellDisplay'
```

```ts
const barGlyphs = computed(() => gridBarGlyphs(props.measures))
```

template のループを置換:

```vue
    <template v-for="(measure, measureIndex) in measures" :key="measureIndex">
      <div class="bar-line">{{ barGlyphs[measureIndex] }}</div>
      <GridMeasureItem
        ...（既存バインディングのまま）
      />
    </template>
    <div class="bar-line" v-if="measures.length > 0">{{ barGlyphs[measures.length] }}</div>
```

（旧テンプレートの「最初の前に `║`、各小節の後に `║`/`│`」構造から「各小節の前に glyph、末尾に glyph」構造への変更。区切り数は同じ measures.length + 1）

- [ ] **Step 7: 旧表示 composable の削除**

```bash
git rm src/composables/useGridCellDisplay.ts src/composables/useGridCellDisplay.test.ts
git rm src/composables/useGridCellHighlight.ts src/composables/useGridCellHighlight.test.ts
grep -rn "useGridCellDisplay\|useGridCellHighlight\|getCellDisplay\|getKaraokeCellClass\|isBarCell\|barDouble\|repeatBoth" src/
```
Expected: 0件。

- [ ] **Step 8: ビルド + lint + 全テスト + コミット**

```bash
npm run build && npm run lint && npm run test
git add -A src/
git commit -m "Unify cell and bar rendering in lib and narrow GridCell type"
```

---

### Task 4: ビジュアルエディタに歌詞ヒント入力 UI

**Files:**
- Modify: `src/lib/chordpro/measureOps.ts`（`setLyricsHint` 追加）+ `measureOps.test.ts`
- Modify: `src/stores/chordproEditor.ts`（`setLyricsHint` アクション追加）+ `chordproEditor.test.ts`
- Modify: `src/components/song/GridMeasureItem.vue`（選択中の小節にヒント入力欄）
- Modify: `src/components/song/GridMeasureList.vue`（`update-lyrics` イベント中継）
- Modify: `src/components/song/GridEditor.vue`（ハンドラ追加）

**Interfaces:**
- Produces:
  - `setLyricsHint(measures: Measure[], measureIndex: number, lyricsHint: string): Measure[]`（trim して空なら `undefined`。不正インデックスは no-op クローン）
  - store: `setLyricsHint(sectionIndex: number, measureIndex: number, lyricsHint: string)`
  - GridMeasureItem 新 emit: `(e: 'update-lyrics', measureIndex: number, value: string): void`（blur / Enter で発火）
- 背景: 現状ヒントはテキストモードでしか作成できない（表示・削除・マージのみ）。小節選択→その場で歌詞編集できるようにする（spec Phase 3 の「小節・コード・歌詞の関係をエディタでも」項）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/chordpro/measureOps.test.ts` に追加（import に `setLyricsHint` を追加）:

```ts
describe('setLyricsHint', () => {
	it('sets, replaces and clears the hint, preserving bars', () => {
		const withHint = setLyricsHint(sample(), 2, ' new words ')
		expect(withHint[2]!.lyricsHint).toBe('new words')
		expect(withHint[2]!.endBar).toBe('repeatEnd')
		const cleared = setLyricsHint(withHint, 2, '   ')
		expect(cleared[2]!.lyricsHint).toBeUndefined()
	})

	it('is a no-op clone for invalid index', () => {
		expect(setLyricsHint(sample(), 99, 'x')).toEqual(sample())
	})
})
```

`src/stores/chordproEditor.test.ts` に追加:

```ts
	it('sets a lyrics hint on a measure and serializes it', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.setLyricsHint(1, 0, 'inserted words')
		expect(grid(store, 1).measures[0]!.lyricsHint).toBe('inserted words')
		expect(store.serialize()).toContain('{lyrics_hint: inserted words')
	})
```

Run: `npx vitest run src/lib/chordpro/measureOps.test.ts src/stores/chordproEditor.test.ts` → FAIL

- [ ] **Step 2: lib + store 実装**

`measureOps.ts` に追加（`clearLyrics` の後）:

```ts
export function setLyricsHint(
	measures: Measure[],
	measureIndex: number,
	lyricsHint: string
): Measure[] {
	const next = cloneMeasures(measures)
	const target = next[measureIndex]
	if (!target) return next
	const trimmed = lyricsHint.trim()
	next[measureIndex] = { ...target, lyricsHint: trimmed ? trimmed : undefined }
	return next
}
```

`chordproEditor.ts`: import に `setLyricsHint as opSetLyricsHint` を追加し、アクションを追加（`clearLyrics` の後）+ return エントリ:

```ts
	function setLyricsHint(sectionIndex: number, measureIndex: number, lyricsHint: string) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opSetLyricsHint(grid.measures, measureIndex, lyricsHint))
	}
```

Run: 上記テスト → PASS

- [ ] **Step 3: UI 実装**

`GridMeasureItem.vue`:
- Emits に追加: `(e: 'update-lyrics', measureIndex: number, value: string): void`
- template のヒント表示部を置換（選択中は入力欄、非選択時は従来表示）:

```vue
    <input
      v-if="selected"
      class="lyrics-hint-input"
      type="text"
      :value="measure.lyricsHint ?? ''"
      placeholder="歌詞を入力"
      @click.stop
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      @blur="emit('update-lyrics', measureIndex, ($event.target as HTMLInputElement).value)"
    />
    <div
      v-else-if="measure.lyricsHint"
      class="lyrics-hint"
      :title="measure.lyricsHint"
      @click="emit('select', measureIndex)"
    >
      {{ measure.lyricsHint }}
    </div>
```

- style に追加:

```css
.lyrics-hint-input {
  width: 100%;
  margin-top: 2px;
  padding: 2px var(--spacing-xs);
  font-size: 0.65rem;
  background: var(--color-bg-card);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  color: var(--color-text);
}
```

`GridMeasureList.vue`: Emits に `(e: 'update-lyrics', measureIndex: number, value: string): void` を追加し、GridMeasureItem のバインディングに `@update-lyrics="(idx, value) => emit('update-lyrics', idx, value)"` を追加。

`GridEditor.vue`: GridMeasureList のバインディングに `@update-lyrics="handleUpdateLyrics"` を追加し、ハンドラを追加:

```ts
function handleUpdateLyrics(measureIndex: number, value: string) {
  store.setLyricsHint(props.sectionIndex, measureIndex, value)
}
```

- [ ] **Step 4: ビルド + lint + 全テスト + コミット**

```bash
npm run build && npm run lint && npm run test
git add -A src/
git commit -m "Add inline lyrics hint editing to the visual editor"
```

---

### Task 5: 命名スイープと完了確認

**Files:**
- 確認のみ + 微修正（grep で見つかった残存のみ）

**Interfaces:**
- Produces: spec Phase 3 完了状態。`hint` 単独命名ゼロ、表示系の重複実装ゼロ、削除ファイルへの参照ゼロ

- [ ] **Step 1: 命名・残存参照の網羅確認**

```bash
grep -rn "\bhint\b\|measureHints" src/ --include="*.ts" --include="*.vue"
grep -rn "LyricsView\|SongKaraokeView\|useKaraokeScroll\|useLyricsHighlight\|useGridCellDisplay\|useGridCellHighlight" src/
```
Expected: どちらも 0件（`lyricsHint` / `lyricsHints` / `lyrics_hint` は対象外のパターンにしてある）。ヒットが出た場合はその場でリネーム/削除する。

- [ ] **Step 2: ビルド + lint + 全テスト**

Run: `npm run build && npm run lint && npm run test`
Expected: すべて成功

- [ ] **Step 3: コミット（Step 1 で修正が出た場合のみ）**

```bash
git add -A src/
git commit -m "Sweep remaining display naming inconsistencies"
```

---

## 完了条件（Phase 3 全体）

- `npm run build && npm run lint && npm run test` がすべて成功
- Task 5 の grep が 0 件
- 手動確認（中和 dev サーバー）:
  - 歌詞のみセクションを含む曲: 静的テキストとして描画され、総小節数・再生時間がグリッド小節のみを反映し、ハイライトが最後までずれない
  - `|:` `:|` `|.` がグリッド表示・エディタのバー区切りに見た目として現れる
  - 小節を選択→ヒント入力欄で入力・Enter→テキストモードで `{lyrics_hint:}` に反映→保存後も保持
  - `/`・`%` セルの表示が Detail/エディタで一致
- リファクタ3フェーズ完了。spec の全項目消化
