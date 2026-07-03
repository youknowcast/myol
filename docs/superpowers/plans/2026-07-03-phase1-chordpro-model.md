# Phase 1: ChordPro データモデルと保存形式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小節（Measure）を唯一の構造単位とし、歌詞ヒント・リピート記号が保存で壊れない決定的な ChordPro 保存形式に移行する（旧形式は読み込み互換のみ）。

**Architecture:** `src/lib/chordpro/parser.ts` のグリッド処理を「テキスト行 → `Measure[]` 直接構築」に書き換え、`GridRow` 中間表現と個数ヒューリスティックを廃止する。新形式は `{lyrics_hint: a | b}` を直下のグリッド行の直前に置き `|` 区切りで小節と位置対応させる。旧形式の解釈は `parseLegacyLyricsHints` に隔離。ジェネレータは4小節/行で決定的に出力する。

**Tech Stack:** Vue 3 + TypeScript + Vite + Vitest。新規依存なし。

**Spec:** `docs/superpowers/specs/2026-07-03-consistency-refactor-design.md`

## Global Constraints

- `.ts` ファイルはタブインデント・シングルクォート・セミコロンなし（既存スタイルに一致させる）
- コミット前に必ず `npm run lint` と `npm run test` を実行し、両方成功を確認する（`/home/youknow/ai-dev-rules/typescript.md`）
- 旧形式（トレイリングの `{lyrics_hint}` ブロック、`|` を含まない行前ヒント）は**読み込み互換を維持**する。既存テスト `parser.test.ts` の legacy ケースを壊さない
- 公開 API の維持: `parseChordPro` / `parseChordProToExtended` / `generateChordPro` / `autoAssignMeasures` / `parseBeatsPerMeasure` / `parseLyricsLine` のシグネチャは変えない
- 作業ディレクトリ: `/home/youknow/Documents/workspace/myol`

---

### Task 1: `/`（ノーコード）トークンのサポート

**Files:**
- Modify: `src/lib/chordpro/types.ts:68`（GridCell 型）
- Modify: `src/lib/chordpro/parser.ts:372-406`（parseGridRow）、`parser.ts:657-670`（cellToString）
- Modify: `src/composables/useGridCellDisplay.ts`
- Test: `src/lib/chordpro/parser.test.ts`、`src/composables/useGridCellDisplay.test.ts`

**Interfaces:**
- Consumes: 既存の `GridCell` 型
- Produces: `GridCell['type']` に `'noChord'` を追加。以降のタスクは `/` ⇄ `{ type: 'noChord' }` の対応に依存する

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/chordpro/parser.test.ts` の `describe('parseChordProToExtended', ...)` 内に追加:

```ts
	it('parses / as a no-chord cell', () => {
		const content = `{start_of_grid}
|| C . / . ||
{end_of_grid}
`

		const parsed = parseChordProToExtended(content)
		const grid = parsed.sections[0]!.content as GridSection
		expect(grid.measures?.[0]?.cells.map(cell => cell.type)).toEqual(['chord', 'empty', 'noChord', 'empty'])
	})
```

`src/composables/useGridCellDisplay.test.ts` の既存 describe 内に追加:

```ts
	it('displays noChord cells as slash', () => {
		const { getCellDisplay } = useGridCellDisplay()
		expect(getCellDisplay({ type: 'noChord' })).toBe('/')
	})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/lib/chordpro/parser.test.ts src/composables/useGridCellDisplay.test.ts`
Expected: FAIL（`noChord` が型に無いためコンパイルエラー、または cells が `['chord','empty','chord','empty']` になる）

- [ ] **Step 3: 実装**

`src/lib/chordpro/types.ts` の `GridCell` を変更:

```ts
export interface GridCell {
	type: 'chord' | 'noChord' | 'empty' | 'repeat' | 'bar' | 'barDouble' | 'barEnd' | 'repeatStart' | 'repeatEnd' | 'repeatBoth'
	value?: string
}
```

`src/lib/chordpro/parser.ts` の `parseGridRow` で `%` の分岐の直前に追加:

```ts
		// No chord (rhythmic hit)
		else if (token === '/') {
			cells.push({ type: 'noChord' })
		}
```

`parser.ts` の `cellToString` に case 追加（`case 'empty'` の直前）:

```ts
		case 'noChord': return '/'
```

`src/composables/useGridCellDisplay.ts` の `getCellDisplay` に case 追加（`case 'empty'` の直前）と、`getCellClass` の `case 'empty':` を `case 'noChord': case 'empty':` に変更:

```ts
		case 'noChord': return '/'
```

```ts
			case 'noChord':
			case 'empty':
				return ['grid-empty']
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/lib/chordpro/parser.test.ts src/composables/useGridCellDisplay.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: lint + 全テスト + コミット**

```bash
npm run lint && npm run test
git add src/lib/chordpro/types.ts src/lib/chordpro/parser.ts src/composables/useGridCellDisplay.ts src/lib/chordpro/parser.test.ts src/composables/useGridCellDisplay.test.ts
git commit -m "Parse / as no-chord grid cell"
```

---

### Task 2: グリッド行を Measure[] へ直接パース（新形式ヒント + 境界バー保持 + レガシー隔離）

**Files:**
- Modify: `src/lib/chordpro/types.ts:62-65`（Measure 型）
- Modify: `src/lib/chordpro/parser.ts`（グリッド蓄積パス全体: state 変数、directive 分岐、コンテンツ分岐、flush 2箇所。旧 `applyLyricsHints` は `parseLegacyLyricsHints` にリネーム）
- Test: `src/lib/chordpro/parser.test.ts`

**Interfaces:**
- Consumes: Task 1 の `noChord` セル
- Produces:
  - `Measure` 型拡張: `startBar?: 'repeatStart'`、`endBar?: 'repeatEnd' | 'barEnd'`
  - parser 内部関数 `parseGridLineToMeasures(line: string): Measure[]`（Task 6 でも使用）
  - parser 内部関数 `buildGridMeasures(entries: GridLineEntry[], trailing: MeasureAnnotationEntry[]): Measure[]`
  - parser 内部関数 `parseLegacyLyricsHints(measures: Measure[], rowStartIndices: number[], lyricsHints?: string[]): void`（旧 `applyLyricsHints` と同一ボディ）
  - 注釈レジストリ `MEASURE_ANNOTATION_DIRECTIVES: Record<string, MeasureAnnotationField>`（現状 `lyrics_hint: 'lyricsHint'` のみ。将来 `stroke` 等を追加する拡張点）
- 挙動: `{lyrics_hint}` は「次に現れるグリッド行」に対応付けて保持。グリッド終端で (a) トレイリングヒント無し かつ 各行のヒント行 ≤1 → **位置対応**（`|` 分割、空セグメントはヒント無し、余剰セグメントは無視）、(b) それ以外 → **レガシー解釈**

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/chordpro/parser.test.ts` に import を追加し（`parseChordPro` を追加）、新しい describe を追加:

```ts
import { parseChordPro, parseChordProToExtended, ensureGridMeasures } from './parser'
```

```ts
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
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/lib/chordpro/parser.test.ts`
Expected: FAIL（新形式ヒントは既存ヒューリスティックで別小節に付く。`startBar`/`endBar` は undefined）。既存テストは PASS のまま

- [ ] **Step 3: 型を拡張**

`src/lib/chordpro/types.ts` の `Measure` を置換:

```ts
// Measure: 小節。歌詞・境界バーを直接保持する（唯一の構造単位）
export interface Measure {
	cells: GridCell[]
	lyricsHint?: string  // この小節に対応する歌詞
	startBar?: 'repeatStart'
	endBar?: 'repeatEnd' | 'barEnd'
}
```

- [ ] **Step 4: パーサを実装**

`src/lib/chordpro/parser.ts` に以下を追加（`parseBeatsPerMeasure` の後）:

```ts
// 小節注釈ディレクティブのレジストリ。
// 「グリッド行の直前に置き、| 区切りで各小節へ 1:1 対応」する注釈の一般機構。
// 将来 stroke 等を足す場合はここに directive → Measure フィールドを登録する。
type MeasureAnnotationField = 'lyricsHint'

const MEASURE_ANNOTATION_DIRECTIVES: Record<string, MeasureAnnotationField> = {
	lyrics_hint: 'lyricsHint'
}

interface MeasureAnnotationEntry {
	field: MeasureAnnotationField
	value: string
}

interface GridLineEntry {
	measures: Measure[]
	annotations: MeasureAnnotationEntry[]
}

function parseGridLineToMeasures(line: string): Measure[] {
	const measures: Measure[] = []
	let currentCells: GridCell[] = []
	let pendingStartBar: Measure['startBar']

	function closeMeasure(endBar?: Measure['endBar']) {
		if (currentCells.length > 0) {
			const measure: Measure = { cells: currentCells }
			if (pendingStartBar) measure.startBar = pendingStartBar
			if (endBar) measure.endBar = endBar
			measures.push(measure)
			currentCells = []
			pendingStartBar = undefined
			return
		}
		const last = measures[measures.length - 1]
		if (endBar && last && !last.endBar) {
			last.endBar = endBar
		}
	}

	const tokens = line.split(/\s+/).filter(token => token)
	for (const token of tokens) {
		switch (token) {
			case '|':
			case '||':
				closeMeasure()
				break
			case '|.':
				closeMeasure('barEnd')
				break
			case '|:':
				closeMeasure()
				pendingStartBar = 'repeatStart'
				break
			case ':|':
				closeMeasure('repeatEnd')
				break
			case ':|:':
				closeMeasure('repeatEnd')
				pendingStartBar = 'repeatStart'
				break
			case '.':
				currentCells.push({ type: 'empty' })
				break
			case '/':
				currentCells.push({ type: 'noChord' })
				break
			case '%':
			case '%%':
				currentCells.push({ type: 'repeat', value: token })
				break
			default:
				currentCells.push({ type: 'chord', value: token })
		}
	}
	closeMeasure()
	return measures
}

function buildGridMeasures(entries: GridLineEntry[], trailing: MeasureAnnotationEntry[]): Measure[] {
	const measures = entries.flatMap(entry => entry.measures)
	const lyricsPerLine = entries.map(entry =>
		entry.annotations.filter(annotation => annotation.field === 'lyricsHint')
	)
	const trailingLyrics = trailing.filter(annotation => annotation.field === 'lyricsHint')
	const isPositional = trailingLyrics.length === 0 && lyricsPerLine.every(list => list.length <= 1)

	if (isPositional) {
		for (const entry of entries) {
			for (const annotation of entry.annotations) {
				const segments = annotation.value.split('|').map(segment => segment.trim())
				segments.forEach((segment, index) => {
					const measure = entry.measures[index]
					if (segment && measure) {
						measure[annotation.field] = segment
					}
				})
			}
		}
		return measures
	}

	// レガシー形式（トレイリングブロック / 1行に複数ヒント）: 個数ヒューリスティックで解釈
	const rowStartIndices: number[] = []
	let offset = 0
	for (const entry of entries) {
		rowStartIndices.push(offset)
		offset += entry.measures.length
	}
	const hints = [...lyricsPerLine.flat(), ...trailingLyrics].map(annotation => annotation.value)
	parseLegacyLyricsHints(measures, rowStartIndices, hints)
	return measures
}
```

既存 `applyLyricsHints` を `parseLegacyLyricsHints` にリネーム（ボディ変更なし。`buildMeasuresFromRows` 内の呼び出しも追随）。

`parseChordPro` 内の変更:

1. state 変数 `let gridRows: GridRow[] = []` と `let gridLyricsHints: string[] = []` を置換:

```ts
	let gridLines: GridLineEntry[] = []
	let pendingAnnotations: MeasureAnnotationEntry[] = []
```

2. `start_of_grid` 分岐の `gridRows = []` / `gridLyricsHints = []` を置換:

```ts
				gridLines = []
				pendingAnnotations = []
```

3. `lyrics_hint` directive 分岐を置換:

```ts
			// 小節注釈ディレクティブ（{lyrics_hint: ...} 等）: 次のグリッド行に対応付ける
			const annotationField = MEASURE_ANNOTATION_DIRECTIVES[dir]
			if (annotationField && inGrid && val) {
				pendingAnnotations.push({ field: annotationField, value: val })
				continue
			}
```

4. グリッドコンテンツ分岐を置換:

```ts
		if (inGrid) {
			const measures = parseGridLineToMeasures(trimmed)
			if (measures.length > 0) {
				gridLines.push({ measures, annotations: pendingAnnotations })
				pendingAnnotations = []
			}
		} else if (inTab) {
```

5. flush 2箇所（`end_of_` 分岐と EOF 後）の `buildMeasuresFromRows(gridRows, gridLyricsHints)` を置換:

```ts
					const measures = buildGridMeasures(gridLines, pendingAnnotations)
```

（EOF 側も同様に `buildGridMeasures(gridLines, pendingAnnotations)`）

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run src/lib/chordpro/parser.test.ts`
Expected: PASS（新規5件 + 既存全件。既存の legacy ケース2件は `buildGridMeasures` のレガシーパスで通る）

- [ ] **Step 6: lint + 全テスト + コミット**

```bash
npm run lint && npm run test
git add src/lib/chordpro/types.ts src/lib/chordpro/parser.ts src/lib/chordpro/parser.test.ts
git commit -m "Parse grid lines directly into measures with positional hints"
```

---

### Task 3: generateChordPro の新形式出力

**Files:**
- Modify: `src/lib/chordpro/parser.ts:607-655`（generateChordPro のグリッド分岐 + ヘルパー追加）
- Test: `src/lib/chordpro/parser.test.ts`

**Interfaces:**
- Consumes: Task 2 の `Measure.startBar` / `endBar`、注釈の位置対応セマンティクス
- Produces: `generateChordPro` が (a) 4小節/行で分割、(b) 各行の直前にその行分の `{lyrics_hint: a | b}` を出力（全セグメント空なら省略、末尾の空セグメントは切り詰め）、(c) 境界バーを復元、(d) ヒント内の `|` を全角 `｜` に置換。トレイリングのヒントブロックは出力しない

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/chordpro/parser.test.ts` に import `generateChordPro` を追加し、describe を追加:

```ts
describe('generateChordPro (grid)', () => {
	it('emits one hint line per grid row, |-separated per measure', () => {
		const song: ParsedSong = {
			title: '',
			artist: '',
			sections: [
				{
					type: 'grid',
					content: {
						kind: 'grid',
						measures: [
							{ cells: [{ type: 'chord', value: 'G' }], lyricsHint: 'one' },
							{ cells: [{ type: 'chord', value: 'C' }] },
							{ cells: [{ type: 'chord', value: 'Am' }], lyricsHint: 'three' },
							{ cells: [{ type: 'chord', value: 'F' }] },
							{ cells: [{ type: 'chord', value: 'D' }], lyricsHint: 'five' }
						]
					}
				}
			]
		}

		const text = generateChordPro(song)
		const lines = text.split('\n').filter(line => line.trim())
		expect(lines).toEqual([
			'{start_of_grid}',
			'{lyrics_hint: one |  | three}',
			'|| G | C | Am | F ||',
			'{lyrics_hint: five}',
			'|| D ||',
			'{end_of_grid}'
		])
	})

	it('omits the hint line when a row has no hints', () => {
		const song: ParsedSong = {
			title: '',
			artist: '',
			sections: [
				{
					type: 'grid',
					content: {
						kind: 'grid',
						measures: [
							{ cells: [{ type: 'chord', value: 'G' }] },
							{ cells: [{ type: 'chord', value: 'C' }] }
						]
					}
				}
			]
		}

		const text = generateChordPro(song)
		expect(text).not.toContain('lyrics_hint')
	})

	it('restores boundary bars and sanitizes | in hints', () => {
		const song: ParsedSong = {
			title: '',
			artist: '',
			sections: [
				{
					type: 'grid',
					content: {
						kind: 'grid',
						measures: [
							{ cells: [{ type: 'chord', value: 'G' }], startBar: 'repeatStart', lyricsHint: 'a | b' },
							{ cells: [{ type: 'chord', value: 'C' }], endBar: 'repeatEnd' }
						]
					}
				}
			]
		}

		const text = generateChordPro(song)
		expect(text).toContain('{lyrics_hint: a ｜ b}')
		expect(text).toContain('|: G | C :|')
	})
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/lib/chordpro/parser.test.ts`
Expected: FAIL（旧実装はトレイリングブロック + 常に `||` を出力する）

- [ ] **Step 3: 実装**

`src/lib/chordpro/parser.ts` に追加（`generateChordPro` の直前）:

```ts
const MEASURES_PER_LINE = 4

function sanitizeAnnotationSegment(segment: string): string {
	return segment.replace(/\|/g, '｜').trim()
}

function gridAnnotationLine(measures: Measure[]): string | null {
	const segments = measures.map(measure => sanitizeAnnotationSegment(measure.lyricsHint ?? ''))
	while (segments.length > 0 && segments[segments.length - 1] === '') {
		segments.pop()
	}
	if (segments.length === 0) return null
	return `{lyrics_hint: ${segments.join(' | ')}}`
}

function boundaryTokens(endBar: Measure['endBar'], startBar: Measure['startBar']): string[] {
	if (endBar === 'repeatEnd' && startBar === 'repeatStart') return [':|:']
	const tokens: string[] = []
	if (endBar === 'repeatEnd') tokens.push(':|')
	if (endBar === 'barEnd') tokens.push('|.')
	if (startBar === 'repeatStart') tokens.push('|:')
	if (tokens.length === 0) tokens.push('|')
	return tokens
}

function gridMeasuresToLine(measures: Measure[]): string {
	const tokens: string[] = []
	measures.forEach((measure, index) => {
		if (index === 0) {
			tokens.push(measure.startBar === 'repeatStart' ? '|:' : '||')
		} else {
			tokens.push(...boundaryTokens(measures[index - 1]!.endBar, measure.startBar))
		}
		tokens.push(...measure.cells.map(cellToString))
	})
	const last = measures[measures.length - 1]
	if (last?.endBar === 'repeatEnd') tokens.push(':|')
	else if (last?.endBar === 'barEnd') tokens.push('|.')
	else tokens.push('||')
	return tokens.join(' ')
}
```

`generateChordPro` のグリッド分岐を置換:

```ts
		if (section.content.kind === 'grid') {
			const shapePart = section.content.shape ? ` shape="${section.content.shape}"` : ''
			lines.push(`{start_of_grid${labelPart}${shapePart}}`)

			const measures = section.content.measures
			for (let start = 0; start < measures.length; start += MEASURES_PER_LINE) {
				const chunk = measures.slice(start, start + MEASURES_PER_LINE)
				const annotationLine = gridAnnotationLine(chunk)
				if (annotationLine) lines.push(annotationLine)
				lines.push(gridMeasuresToLine(chunk))
			}
			lines.push(`{end_of_grid}`)
		} else if (section.content.kind === 'tab') {
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/lib/chordpro/parser.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: lint + 全テスト + コミット**

```bash
npm run lint && npm run test
git add src/lib/chordpro/parser.ts src/lib/chordpro/parser.test.ts
git commit -m "Emit deterministic per-row lyrics hints in generateChordPro"
```

---

### Task 4: ラウンドトリップ回帰テスト

**Files:**
- Create: `src/lib/chordpro/roundtrip.test.ts`

**Interfaces:**
- Consumes: `parseChordPro` / `generateChordPro`（Task 2, 3 の実装）
- Produces: 「parse → generate → parse でグリッドが不変」という Phase 1 の完了条件を固定する回帰テスト。以降の全タスクはこのテストを緑に保つ

- [ ] **Step 1: テストを書く**

`src/lib/chordpro/roundtrip.test.ts` を作成:

```ts
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
			lyricsHint: `hint${index}`
		}))
		const text = generateChordPro({
			title: '',
			artist: '',
			sections: [{ type: 'grid', content: { kind: 'grid', measures } }]
		})

		const reparsed = gridMeasures(text)
		expect(reparsed.map(measure => measure.lyricsHint)).toEqual([
			'hint0', 'hint1', 'hint2', 'hint3', 'hint4', 'hint5'
		])
	})
})
```

- [ ] **Step 2: テストが通ることを確認**

Run: `npx vitest run src/lib/chordpro/roundtrip.test.ts`
Expected: PASS（Task 2, 3 が正しければ全件通る。落ちた場合はここで直してからコミット — このタスクの本質は完了条件の固定）

- [ ] **Step 3: lint + 全テスト + コミット**

```bash
npm run lint && npm run test
git add src/lib/chordpro/roundtrip.test.ts
git commit -m "Add chordpro round-trip regression tests"
```

---

### Task 5: useGridViewState を小節ベースに書き換え

**Files:**
- Modify: `src/components/song/composables/useGridViewState.ts`
- Test: `src/components/song/composables/useGridViewState.test.ts`

**Interfaces:**
- Consumes: `GridSection.measures`（`Measure[]`）
- Produces: 既存と同一の公開インターフェース `{ measureHints, cellsWithMeasures, currentRowIndex }`。ただし `cellsWithMeasures` にバー種別セルは含まれなくなる（`measureIndex` は配列位置から直接算出）。`GridView.vue` は変更不要（バーセルは元々 `isBarCell` でスキップしていた）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/song/composables/useGridViewState.test.ts` の describe 内に追加:

```ts
	it('derives measure indices from array position without bar cells', () => {
		const wideGrid: GridSection = {
			kind: 'grid',
			measures: [
				{ cells: [{ type: 'chord', value: 'C' }, { type: 'empty' }] },
				{ cells: [{ type: 'chord', value: 'G' }] },
				{ cells: [{ type: 'chord', value: 'Am' }] }
			]
		}
		const { cellsWithMeasures } = useGridViewState({
			grid: wideGrid,
			currentMeasure: ref(-1),
			measureOffset: ref(10)
		})

		// 2小節/行 → 行0 = 小節0,1 / 行1 = 小節2
		expect(cellsWithMeasures.value.length).toBe(2)
		expect(cellsWithMeasures.value[0]!.map(cell => cell.measureIndex)).toEqual([10, 10, 11])
		expect(cellsWithMeasures.value[1]!.map(cell => cell.measureIndex)).toEqual([12])
		const barTypes = ['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth']
		expect(cellsWithMeasures.value.flat().some(cell => barTypes.includes(cell.type))).toBe(false)
	})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/components/song/composables/useGridViewState.test.ts`
Expected: FAIL（旧実装はバーセルを含むため要素数・並びが合わない）

- [ ] **Step 3: 実装（ファイル全体を置換）**

```ts
import { computed, type ComputedRef, type Ref } from 'vue'
import type { GridCell, GridSection } from '@/lib/chordpro/types'

export interface CellWithMeasure extends GridCell {
	measureIndex: number
	isCurrentMeasure: boolean
}

export interface UseGridViewStateOptions {
	grid: GridSection
	currentMeasure: Ref<number>
	measureOffset: Ref<number>
}

export function useGridViewState(options: UseGridViewStateOptions) {
	const measuresPerRow = 2

	const measureHints = computed(() =>
		options.grid.measures.map((measure) => measure.lyricsHint?.trim() ?? '')
	)

	const cellsWithMeasures: ComputedRef<CellWithMeasure[][]> = computed(() => {
		const rows: CellWithMeasure[][] = []
		const measures = options.grid.measures

		for (let start = 0; start < measures.length; start += measuresPerRow) {
			const rowCells: CellWithMeasure[] = []
			measures.slice(start, start + measuresPerRow).forEach((measure, indexInRow) => {
				const globalIndex = start + indexInRow + options.measureOffset.value
				for (const cell of measure.cells) {
					rowCells.push({
						type: cell.type,
						value: cell.value,
						measureIndex: globalIndex,
						isCurrentMeasure: globalIndex === options.currentMeasure.value
					})
				}
			})
			rows.push(rowCells)
		}

		return rows
	})

	const currentRowIndex = computed(() => {
		for (let rowIdx = 0; rowIdx < cellsWithMeasures.value.length; rowIdx += 1) {
			const row = cellsWithMeasures.value[rowIdx]
			if (row?.some(cell => cell.isCurrentMeasure)) {
				return rowIdx
			}
		}
		return 0
	})

	return {
		measureHints,
		cellsWithMeasures,
		currentRowIndex
	}
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/components/song/composables/useGridViewState.test.ts`
Expected: PASS（新規1件 + 既存3件）

- [ ] **Step 5: 表示確認 + lint + 全テスト + コミット**

`npm run dev` でアプリを起動し、曲詳細ページの Grid 表示が従来どおり（2小節/行、ヒント表示、再生ハイライト）であることを目視確認する。

```bash
npm run lint && npm run test
git add src/components/song/composables/useGridViewState.ts src/components/song/composables/useGridViewState.test.ts
git commit -m "Group grid view rows from measures without bar-cell reconstruction"
```

---

### Task 6: autoAssignMeasures を Measure 直接構築に書き換え

**Files:**
- Modify: `src/lib/chordpro/parser.ts:417-602`（`autoAssignMeasuresToGrid` / `lyricsLineToGridRow` を削除し `lyricsLineToMeasures` に置換、`autoAssignMeasures` を書き換え、`splitRowsIntoMeasures` / `buildMeasuresFromRows` を削除）
- Test: `src/lib/chordpro/parser.test.ts`

**Interfaces:**
- Consumes: Task 2 の `Measure` 型
- Produces: `autoAssignMeasures(song, beatsPerMeasure)` のシグネチャ・変換結果は維持（コードだけの歌詞行 → グリッドセクション、歌詞はその行の先頭小節の `lyricsHint`）。`GridRow` を経由する内部関数はすべて消える

- [ ] **Step 1: 失敗するテストを書く（挙動固定）**

`src/lib/chordpro/parser.test.ts` の `describe('parseChordProToExtended', ...)` 内に追加:

```ts
	it('splits long chord lines into measures by beatsPerMeasure', () => {
		const content = `{time: 4/4}

{start_of_verse}
[C]a [G]b [Am]c [F]d [C]e [G]f
{end_of_verse}
`

		const parsed = parseChordProToExtended(content)
		const grid = parsed.sections.find(section => section.content.kind === 'grid')!.content as GridSection
		expect(grid.measures.length).toBe(2)
		expect(grid.measures[0]!.cells.map(cell => cell.value)).toEqual(['C', 'G', 'Am', 'F'])
		expect(grid.measures[1]!.cells.map(cell => cell.value)).toEqual(['C', 'G'])
		expect(grid.measures[0]!.lyricsHint).toBe('a b c d e f')
		expect(grid.measures[1]!.lyricsHint).toBeUndefined()
	})
```

- [ ] **Step 2: テストの現状を確認**

Run: `npx vitest run src/lib/chordpro/parser.test.ts`
Expected: PASS（旧実装でもこの挙動。これは書き換えの安全網。FAIL した場合は期待値を旧実装の実挙動に合わせて修正してから進む）

- [ ] **Step 3: 実装**

`src/lib/chordpro/parser.ts` から `autoAssignMeasuresToGrid`・`lyricsLineToGridRow`・`splitRowsIntoMeasures`・`buildMeasuresFromRows` を削除し、以下を追加:

```ts
function lyricsLineToMeasures(
	line: LyricsLine,
	beatsPerMeasure: number
): { measures: Measure[] } | null {
	const chords = line.segments
		.filter(segment => segment.chord !== null)
		.map(segment => segment.chord as string)
	if (chords.length === 0) return null

	const lyrics = line.segments
		.map(segment => segment.text)
		.join('')
		.trim()

	const measures: Measure[] = []
	for (let start = 0; start < chords.length; start += beatsPerMeasure) {
		measures.push({
			cells: chords.slice(start, start + beatsPerMeasure).map(chord => ({ type: 'chord', value: chord }))
		})
	}
	if (lyrics && measures[0]) {
		measures[0].lyricsHint = lyrics
	}
	return { measures }
}
```

`autoAssignMeasures` を置換:

```ts
export function autoAssignMeasures(
	song: ParsedSong,
	beatsPerMeasure: number = 4
): ParsedSong {
	const newSections: Section[] = []

	for (const section of song.sections) {
		if (section.content.kind !== 'lyrics') {
			newSections.push(section)
			continue
		}

		const gridMeasures: Measure[] = []
		const remainingLyricsLines: LyricsLine[] = []

		for (const line of section.content.lines) {
			const result = lyricsLineToMeasures(line, beatsPerMeasure)
			if (result) {
				gridMeasures.push(...result.measures)
			} else {
				remainingLyricsLines.push(line)
			}
		}

		if (gridMeasures.length > 0) {
			newSections.push({
				type: 'grid',
				label: section.label ? `${section.label} (Grid)` : 'Chord Progression',
				content: {
					kind: 'grid',
					measures: gridMeasures
				} as GridSection
			})
		}

		if (remainingLyricsLines.length > 0) {
			newSections.push({
				...section,
				content: {
					kind: 'lyrics',
					lines: remainingLyricsLines
				} as LyricsSection
			})
		} else if (gridMeasures.length === 0) {
			newSections.push(section)
		}
	}

	return {
		...song,
		sections: newSections
	}
}
```

未使用になった import（`LyricsSegment` 等）があれば削除する。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/lib/chordpro/parser.test.ts src/lib/chordpro/roundtrip.test.ts`
Expected: PASS（全件。特に 'converts chorded lyrics into grid measures' と Step 1 のテスト）

- [ ] **Step 5: lint + 全テスト + コミット**

```bash
npm run lint && npm run test
git add src/lib/chordpro/parser.ts src/lib/chordpro/parser.test.ts
git commit -m "Build auto-assigned measures directly without GridRow"
```

---

### Task 7: GridRow と残存デッドコードの削除

**Files:**
- Modify: `src/lib/chordpro/types.ts:57-59`（GridRow 削除）
- Modify: `src/lib/chordpro/parser.ts`（`parseGridRow` / `gridRowsFromMeasures` / `ensureGridMeasures` 削除、import 整理）
- Modify: `src/lib/chordpro/parser.test.ts`（`ensureGridMeasures` テストと import の削除）

**Interfaces:**
- Consumes: Task 5, 6 完了（`GridRow` の消費者ゼロ）
- Produces: `GridRow` 型・行再構成関数が存在しないコードベース。parser の export は `parseBeatsPerMeasure` / `parseChordPro` / `parseChordProToExtended` / `parseLyricsLine` / `autoAssignMeasures` / `generateChordPro` のみ

- [ ] **Step 1: 削除**

- `src/lib/chordpro/types.ts`: `GridRow` インターフェースと `GridSection.measures` の行コメント `// 新形式: 小節ごとに歌詞を持つ`・`Measure` の `// 新しい Measure インターフェース...` コメントを整理（「新形式」注記は Phase 1 完了で不要）
- `src/lib/chordpro/parser.ts`: `parseGridRow`・`gridRowsFromMeasures`・`ensureGridMeasures` を削除。`parseChordProToExtended` を以下に置換:

```ts
export function parseChordProToExtended(content: string): ParsedSong {
	const parsed = parseChordPro(content)
	const beatsPerMeasure = parseBeatsPerMeasure(parsed.time)
	return autoAssignMeasures(parsed, beatsPerMeasure)
}
```

- import から `GridRow` を削除
- `src/lib/chordpro/parser.test.ts`: `ensureGridMeasures` の import と `it('does not overwrite existing measures', ...)` テストを削除

- [ ] **Step 2: 参照が残っていないことを確認**

Run: `grep -rn "GridRow\|gridRowsFromMeasures\|ensureGridMeasures\|parseGridRow\|lyricsLineToGridRow\|autoAssignMeasuresToGrid" src/`
Expected: ヒットなし（0件）

- [ ] **Step 3: ビルド + lint + 全テスト**

Run: `npm run build && npm run lint && npm run test`
Expected: すべて成功（`vue-tsc` の型チェックで取り漏れが出ればここで修正）

- [ ] **Step 4: コミット**

```bash
git add src/lib/chordpro/types.ts src/lib/chordpro/parser.ts src/lib/chordpro/parser.test.ts
git commit -m "Remove GridRow and legacy row reconstruction code"
```

---

### Task 8: docs/chordpro.md を新仕様に更新

**Files:**
- Modify: `docs/chordpro.md`（Lyrics Hints 節の全面書き換え + Symbols 節の補記）

**Interfaces:**
- Consumes: Task 1-7 で確定した実装挙動
- Produces: 実装と一致したフォーマット仕様書

- [ ] **Step 1: Lyrics Hints 節を置換**

`docs/chordpro.md` の `## Lyrics Hints` 節（「Each `{lyrics_hint}` applies to the **entire row**」を含む部分）を以下に置換:

```markdown
## Lyrics Hints

To associate lyrics with grid measures, place a `{lyrics_hint}` directive
directly above a grid row. The hint text is split by `|`, and each segment
maps 1:1 to the measures of that row, in order.

```chordpro
{start_of_grid}
{lyrics_hint: Amazing grace how | sweet the sound}
| G . . . | C . G . |
{lyrics_hint: That saved a | wretch like me}
| G . . . | D . . . |
{end_of_grid}
```

- Each segment attaches to the measure at the same position (**per measure**,
  not per row).
- An empty segment means "no hint for this measure"
  (`{lyrics_hint: | sweet}` leaves the first measure without a hint).
- Segments beyond the number of measures in the row are ignored.
- `|` cannot be used inside hint text; when saving, the app replaces it with
  the full-width `｜`.
- Measure annotations generalize this mechanism: future directives
  (e.g. strumming patterns) follow the same "annotation line above the row,
  `|`-separated per measure" form.

### Legacy format (read-only)

Files saved by older versions carry `{lyrics_hint}` directives as a trailing
block after the grid rows, or one hint line per row without `|`. These are
still read (hints are matched by count: per-measure when counts match, else
per-row onto each row's first measure), but the app always saves in the new
format above.
```

- [ ] **Step 2: Symbols 節を実装に合わせる**

`### Symbols` の `/` の行を確認し、以下へ更新（実装済みの `noChord` セルと一致させる）:

```markdown
- `.` : Empty beat/spacer
- `%` : Repeat previous measure
- `/` : No chord (rhythmic hit) — parsed as a dedicated no-chord cell
```

また `### Bar Lines` の末尾に追記:

```markdown
Repeat/end bars are preserved per measure across save (`Measure.startBar` /
`Measure.endBar` internally); plain `|` and `||` are layout-normalized to
4 measures per line when saving.
```

- [ ] **Step 3: 実装との突合**

docs の全コード例を `parseChordPro` に通した場合の挙動を Task 2-4 のテストケースと照らし、齟齬がないことを確認する（新形式例は Task 4 の star テストと同一構造）。

- [ ] **Step 4: コミット**

```bash
git add docs/chordpro.md
git commit -m "Document measure-level lyrics hints and annotation format"
```

---

## 完了条件（Phase 1 全体）

- `npm run build && npm run lint && npm run test` がすべて成功
- `grep -rn "GridRow" src/` が0件
- 手動確認: 既存曲（旧形式）を開く → 表示が従来どおり → 保存 → 再度開いてもヒント・リピート記号が同じ小節に付いている
- Phase 2 の計画作成に着手できる状態（`stores/` と `pages/` は本フェーズでは未変更）
