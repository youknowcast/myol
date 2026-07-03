# Phase 2: 状態管理の再編 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `chordproEditor` ストアを編集の唯一の SoT にし、「編集のたびに全文 serialize→reparse」を廃止して parse/generate をモード切替時と保存時のみに限定する。

**Architecture:** 小節ミューテーションを純関数（`lib/chordpro/measureOps.ts`）に抽出し、ストアのアクションとして公開。コンポーネント（GridEditor）は intent を受けてストアアクションを呼ぶだけになり、`update:modelValue` チェーン・deep watcher 同期・SongEditPage 内の重複するセクション跨ぎ移動実装（同じドラッグで別セルを掴み得るバグの温床）を全廃する。メタデータ保存も document 直接更新に変え、非拡張パーサでの全文往復を廃止する。

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vitest。新規依存なし。

**Spec:** `docs/superpowers/specs/2026-07-03-consistency-refactor-design.md`（Phase 2 節 + 責務マップ + エラーハンドリング）

**Branch:** `refactor/phase2-state-management`（main から作成）

## Global Constraints

- `.ts` ファイルはタブインデント・シングルクォート・セミコロンなし。`.vue` ファイルは各ファイルの既存スタイル（SongEditPage/GridEditor は2スペース）に一致させる
- コミット前に必ず `npm run lint` と `npm run test` を実行し、両方成功を確認する
- ストアアクションは不正インデックスに対して no-op（throw しない）— spec のエラーハンドリング方針
- 小節の再構築時は必ず `...measure` スプレッドで `startBar`/`endBar`/`lyricsHint` を保持する（Phase 1 で修正したバグの再発防止）
- 「歌詞付き小節の削除は許可」（spec 決定事項）— デッドコード側の削除禁止ルールは復活させない
- 閲覧側（`SongDetailPage` / `useChordProDocument` の閲覧用途）の挙動は本フェーズでは変更しない
- 作業ディレクトリ: `/home/youknow/Documents/workspace/myol`

---

### Task 1: 小節操作の純関数化（lib/chordpro/measureOps.ts）

**Files:**
- Create: `src/lib/chordpro/measureOps.ts`
- Create: `src/lib/chordpro/measureOps.test.ts`

**Interfaces:**
- Consumes: `Measure` / `GridCell`（`./types`）
- Produces（後続タスクが依存する正確なシグネチャ）:
  - `cloneMeasures(measures: Measure[]): Measure[]`
  - `createEmptyMeasure(): Measure`
  - `addMeasure(measures: Measure[], position: 'end' | 'before' | 'after', anchorIndex: number | null): Measure[]`
  - `copyMeasure(measures: Measure[], measureIndex: number): Measure[]`
  - `deleteMeasure(measures: Measure[], measureIndex: number): Measure[]`（最後の1小節は削除不可＝入力のクローンを返す。歌詞付きでも削除可）
  - `clearLyrics(measures: Measure[], measureIndex: number): Measure[]`
  - `clearChords(measures: Measure[], measureIndex: number): Measure[]`
  - `swapMeasure(measures: Measure[], measureIndex: number, direction: 'left' | 'right'): Measure[]`
  - `mergeLyrics(measures: Measure[], sourceIndex: number, direction: 'left' | 'right'): Measure[]`
  - `reorderCells(measures: Measure[], measureIndex: number, newOrder: number[]): Measure[]`（`newOrder[i]` = 位置 i に置く元セルの index。順列でなければ no-op）
  - `moveCellWithinGrid(measures: Measure[], payload: MoveCellWithinGridPayload): Measure[]`
  - `moveCellAcrossGrids(fromMeasures: Measure[], toMeasures: Measure[], payload: MoveCellWithinGridPayload): { from: Measure[]; to: Measure[] } | null`
  - `moveMeasureAcrossGrids(fromMeasures: Measure[], toMeasures: Measure[], fromMeasureIndex: number, insertAtStart: boolean): { from: Measure[]; to: Measure[] } | null`
  - `interface MoveCellWithinGridPayload { fromMeasureIndex: number; toMeasureIndex: number; sourceCellIndex: number; newIndex: number | null }`
- 挙動はすべて既存の `useGridMeasureEditor.ts` / `SongEditPage.vue` の実装から**忠実に移植**する（空になったソース小節は `empty` セル1個で埋める、ターゲットの `empty` セルを `newIndex` に最も近い位置で置換、無ければ挿入、`empty` セルは移動対象外、等）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/chordpro/measureOps.test.ts` を作成。既存の `useGridMeasureEditor.test.ts` のケースを純関数呼び出し形に移植しつつ、以下を必ず含める:

```ts
import { describe, it, expect } from 'vitest'
import {
	addMeasure,
	copyMeasure,
	deleteMeasure,
	clearLyrics,
	clearChords,
	swapMeasure,
	mergeLyrics,
	reorderCells,
	moveCellWithinGrid,
	moveCellAcrossGrids,
	moveMeasureAcrossGrids
} from './measureOps'
import type { Measure } from './types'

function sample(): Measure[] {
	return [
		{
			cells: [{ type: 'chord', value: 'G' }, { type: 'empty' }],
			lyricsHint: 'one',
			startBar: 'repeatStart'
		},
		{
			cells: [{ type: 'chord', value: 'C' }, { type: 'empty' }],
			lyricsHint: 'two'
		},
		{
			cells: [{ type: 'chord', value: 'D' }],
			endBar: 'repeatEnd'
		}
	]
}

describe('addMeasure', () => {
	it('appends an empty measure at end without touching bars', () => {
		const next = addMeasure(sample(), 'end', null)
		expect(next.length).toBe(4)
		expect(next[3]!.cells).toEqual([{ type: 'empty' }])
		expect(next[0]!.startBar).toBe('repeatStart')
		expect(next[2]!.endBar).toBe('repeatEnd')
	})

	it('inserts before/after the anchor', () => {
		expect(addMeasure(sample(), 'before', 1)[1]!.cells).toEqual([{ type: 'empty' }])
		expect(addMeasure(sample(), 'after', 1)[2]!.cells).toEqual([{ type: 'empty' }])
	})

	it('is a no-op clone when anchor is null or out of range', () => {
		expect(addMeasure(sample(), 'after', null)).toEqual(sample())
		expect(addMeasure(sample(), 'after', 99)).toEqual(sample())
	})
})

describe('copyMeasure / deleteMeasure', () => {
	it('duplicates the measure including bars and hint', () => {
		const next = copyMeasure(sample(), 0)
		expect(next.length).toBe(4)
		expect(next[1]).toEqual(sample()[0])
	})

	it('deletes a measure with lyrics (allowed by spec)', () => {
		const next = deleteMeasure(sample(), 1)
		expect(next.length).toBe(2)
		expect(next.map(m => m.lyricsHint)).toEqual(['one', undefined])
	})

	it('refuses to delete the last measure', () => {
		const single: Measure[] = [{ cells: [{ type: 'chord', value: 'G' }] }]
		expect(deleteMeasure(single, 0)).toEqual(single)
	})
})

describe('clearLyrics / clearChords / swapMeasure / mergeLyrics', () => {
	it('clears only lyrics, keeping cells and bars', () => {
		const next = clearLyrics(sample(), 0)
		expect(next[0]!.lyricsHint).toBeUndefined()
		expect(next[0]!.startBar).toBe('repeatStart')
	})

	it('replaces cells with empties of same length', () => {
		const next = clearChords(sample(), 0)
		expect(next[0]!.cells).toEqual([{ type: 'empty' }, { type: 'empty' }])
		expect(next[0]!.lyricsHint).toBe('one')
	})

	it('swaps neighbours and is a no-op at the edge', () => {
		const next = swapMeasure(sample(), 0, 'right')
		expect(next[0]!.lyricsHint).toBe('two')
		expect(next[1]!.lyricsHint).toBe('one')
		expect(swapMeasure(sample(), 0, 'left')).toEqual(sample())
	})

	it('merges lyrics into the neighbour and clears the source', () => {
		const next = mergeLyrics(sample(), 1, 'left')
		expect(next[0]!.lyricsHint).toBe('one two')
		expect(next[1]!.lyricsHint).toBeUndefined()
	})
})

describe('reorderCells', () => {
	it('applies a permutation', () => {
		const next = reorderCells(sample(), 0, [1, 0])
		expect(next[0]!.cells.map(c => c.type)).toEqual(['empty', 'chord'])
	})

	it('rejects non-permutations', () => {
		expect(reorderCells(sample(), 0, [0, 0])).toEqual(sample())
		expect(reorderCells(sample(), 0, [0])).toEqual(sample())
		expect(reorderCells(sample(), 0, [0, 5])).toEqual(sample())
	})
})

describe('cell/measure moves', () => {
	it('moves a chord into the target empty slot within a grid', () => {
		const next = moveCellWithinGrid(sample(), {
			fromMeasureIndex: 0,
			toMeasureIndex: 1,
			sourceCellIndex: 0,
			newIndex: 1
		})
		expect(next[0]!.cells).toEqual([{ type: 'empty' }])
		expect(next[1]!.cells).toEqual([{ type: 'chord', value: 'C' }, { type: 'chord', value: 'G' }])
		expect(next[0]!.startBar).toBe('repeatStart')
	})

	it('refuses to move an empty cell', () => {
		const next = moveCellWithinGrid(sample(), {
			fromMeasureIndex: 0,
			toMeasureIndex: 1,
			sourceCellIndex: 1,
			newIndex: 0
		})
		expect(next).toEqual(sample())
	})

	it('moves a cell across grids, refilling an emptied source measure', () => {
		const from: Measure[] = [{ cells: [{ type: 'chord', value: 'Am' }], lyricsHint: 'solo' }]
		const to = sample()
		const result = moveCellAcrossGrids(from, to, {
			fromMeasureIndex: 0,
			toMeasureIndex: 2,
			sourceCellIndex: 0,
			newIndex: 0
		})
		expect(result).not.toBeNull()
		expect(result!.from[0]!.cells).toEqual([{ type: 'empty' }])
		expect(result!.from[0]!.lyricsHint).toBe('solo')
		expect(result!.to[2]!.cells.map(c => c.value)).toEqual(['Am', 'D'])
		expect(result!.to[2]!.endBar).toBe('repeatEnd')
	})

	it('moves a measure across grids preserving bars, refilling the source', () => {
		const from: Measure[] = [{ cells: [{ type: 'chord', value: 'Am' }], startBar: 'repeatStart' }]
		const to = sample()
		const result = moveMeasureAcrossGrids(from, to, 0, true)
		expect(result!.from[0]!.cells).toEqual([{ type: 'empty' }])
		expect(result!.to.length).toBe(4)
		expect(result!.to[0]!.startBar).toBe('repeatStart')
		expect(result!.to[0]!.cells[0]!.value).toBe('Am')
	})

	it('does not mutate its inputs', () => {
		const input = sample()
		moveCellWithinGrid(input, { fromMeasureIndex: 0, toMeasureIndex: 1, sourceCellIndex: 0, newIndex: 0 })
		expect(input).toEqual(sample())
	})
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/lib/chordpro/measureOps.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`src/lib/chordpro/measureOps.ts` を作成:

```ts
import type { GridCell, Measure } from './types'

export interface MoveCellWithinGridPayload {
	fromMeasureIndex: number
	toMeasureIndex: number
	sourceCellIndex: number
	newIndex: number | null
}

export function cloneMeasures(measures: Measure[]): Measure[] {
	return measures.map(measure => ({
		...measure,
		cells: measure.cells.map(cell => ({ ...cell }))
	}))
}

export function createEmptyMeasure(): Measure {
	return { cells: [{ type: 'empty' }] }
}

export function addMeasure(
	measures: Measure[],
	position: 'end' | 'before' | 'after',
	anchorIndex: number | null
): Measure[] {
	const next = cloneMeasures(measures)
	if (position === 'end') {
		next.push(createEmptyMeasure())
		return next
	}
	if (anchorIndex === null || anchorIndex < 0 || anchorIndex >= measures.length) return next
	const insertIndex = position === 'before' ? anchorIndex : anchorIndex + 1
	next.splice(insertIndex, 0, createEmptyMeasure())
	return next
}

export function copyMeasure(measures: Measure[], measureIndex: number): Measure[] {
	const next = cloneMeasures(measures)
	const original = next[measureIndex]
	if (!original) return next
	next.splice(measureIndex + 1, 0, {
		...original,
		cells: original.cells.map(cell => ({ ...cell }))
	})
	return next
}

export function deleteMeasure(measures: Measure[], measureIndex: number): Measure[] {
	const next = cloneMeasures(measures)
	if (measures.length <= 1) return next
	if (measureIndex < 0 || measureIndex >= next.length) return next
	next.splice(measureIndex, 1)
	return next
}

export function clearLyrics(measures: Measure[], measureIndex: number): Measure[] {
	const next = cloneMeasures(measures)
	const target = next[measureIndex]
	if (!target) return next
	next[measureIndex] = { ...target, lyricsHint: undefined }
	return next
}

export function clearChords(measures: Measure[], measureIndex: number): Measure[] {
	const next = cloneMeasures(measures)
	const target = next[measureIndex]
	if (!target) return next
	const clearedCells: GridCell[] = target.cells.length > 0
		? target.cells.map(() => ({ type: 'empty' as const }))
		: [{ type: 'empty' as const }]
	next[measureIndex] = { ...target, cells: clearedCells }
	return next
}

export function swapMeasure(
	measures: Measure[],
	measureIndex: number,
	direction: 'left' | 'right'
): Measure[] {
	const targetIndex = direction === 'left' ? measureIndex - 1 : measureIndex + 1
	const next = cloneMeasures(measures)
	if (measureIndex < 0 || measureIndex >= next.length) return next
	if (targetIndex < 0 || targetIndex >= next.length) return next
	const temp = next[measureIndex]!
	next[measureIndex] = next[targetIndex]!
	next[targetIndex] = temp
	return next
}

export function mergeLyrics(
	measures: Measure[],
	sourceIndex: number,
	direction: 'left' | 'right'
): Measure[] {
	const next = cloneMeasures(measures)
	const targetIndex = direction === 'left' ? sourceIndex - 1 : sourceIndex + 1
	if (targetIndex < 0 || targetIndex >= next.length) return next
	const sourceLyrics = next[sourceIndex]?.lyricsHint?.trim()
	if (!sourceLyrics) return next
	const targetLyrics = next[targetIndex]?.lyricsHint?.trim()
	const mergedLyrics = targetLyrics
		? direction === 'left'
			? `${targetLyrics} ${sourceLyrics}`
			: `${sourceLyrics} ${targetLyrics}`
		: sourceLyrics
	next[targetIndex] = { ...next[targetIndex]!, lyricsHint: mergedLyrics }
	next[sourceIndex] = { ...next[sourceIndex]!, lyricsHint: undefined }
	return next
}

export function reorderCells(
	measures: Measure[],
	measureIndex: number,
	newOrder: number[]
): Measure[] {
	const next = cloneMeasures(measures)
	const measure = measures[measureIndex]
	if (!measure) return next
	if (newOrder.length !== measure.cells.length) return next
	const seen = new Set(newOrder)
	if (seen.size !== measure.cells.length) return next
	if (newOrder.some(index => index < 0 || index >= measure.cells.length)) return next
	next[measureIndex] = {
		...next[measureIndex]!,
		cells: newOrder.map(index => ({ ...measure.cells[index]! }))
	}
	return next
}

function extractCell(sourceCells: GridCell[], sourceCellIndex: number): GridCell | null {
	const movedCell = sourceCells[sourceCellIndex]
	if (!movedCell || movedCell.type === 'empty') return null
	sourceCells.splice(sourceCellIndex, 1)
	if (sourceCells.length === 0) {
		sourceCells.push({ type: 'empty' })
	}
	return movedCell
}

function placeCell(targetCells: GridCell[], movedCell: GridCell, newIndex: number | null) {
	const emptyIndices = targetCells
		.map((cell, index) => (cell.type === 'empty' ? index : null))
		.filter((index): index is number => index !== null)

	if (emptyIndices.length > 0) {
		const fallbackIndex = emptyIndices[0] ?? 0
		const replaceIndex = typeof newIndex === 'number'
			? emptyIndices.reduce((closest, index) =>
				(Math.abs(index - newIndex) < Math.abs(closest - newIndex) ? index : closest), fallbackIndex)
			: fallbackIndex
		targetCells.splice(replaceIndex, 1, { ...movedCell })
		return
	}

	let insertIndex = typeof newIndex === 'number' ? newIndex : targetCells.length
	if (insertIndex < 0) insertIndex = 0
	if (insertIndex > targetCells.length) insertIndex = targetCells.length
	targetCells.splice(insertIndex, 0, { ...movedCell })
}

export function moveCellWithinGrid(
	measures: Measure[],
	payload: MoveCellWithinGridPayload
): Measure[] {
	const next = cloneMeasures(measures)
	if (payload.fromMeasureIndex === payload.toMeasureIndex) return next
	const source = measures[payload.fromMeasureIndex]
	const target = measures[payload.toMeasureIndex]
	if (!source || !target) return next
	const sourceCells = source.cells.map(cell => ({ ...cell }))
	const targetCells = target.cells.map(cell => ({ ...cell }))
	const movedCell = extractCell(sourceCells, payload.sourceCellIndex)
	if (!movedCell) return next
	placeCell(targetCells, movedCell, payload.newIndex)
	next[payload.fromMeasureIndex] = { ...next[payload.fromMeasureIndex]!, cells: sourceCells }
	next[payload.toMeasureIndex] = { ...next[payload.toMeasureIndex]!, cells: targetCells }
	return next
}

export function moveCellAcrossGrids(
	fromMeasures: Measure[],
	toMeasures: Measure[],
	payload: MoveCellWithinGridPayload
): { from: Measure[]; to: Measure[] } | null {
	const source = fromMeasures[payload.fromMeasureIndex]
	const target = toMeasures[payload.toMeasureIndex]
	if (!source || !target) return null
	const sourceCells = source.cells.map(cell => ({ ...cell }))
	const targetCells = target.cells.map(cell => ({ ...cell }))
	const movedCell = extractCell(sourceCells, payload.sourceCellIndex)
	if (!movedCell) return null
	placeCell(targetCells, movedCell, payload.newIndex)
	const from = cloneMeasures(fromMeasures)
	from[payload.fromMeasureIndex] = { ...from[payload.fromMeasureIndex]!, cells: sourceCells }
	const to = cloneMeasures(toMeasures)
	to[payload.toMeasureIndex] = { ...to[payload.toMeasureIndex]!, cells: targetCells }
	return { from, to }
}

export function moveMeasureAcrossGrids(
	fromMeasures: Measure[],
	toMeasures: Measure[],
	fromMeasureIndex: number,
	insertAtStart: boolean
): { from: Measure[]; to: Measure[] } | null {
	const movedMeasure = fromMeasures[fromMeasureIndex]
	if (!movedMeasure) return null
	const from = cloneMeasures(fromMeasures)
	from.splice(fromMeasureIndex, 1)
	if (from.length === 0) {
		from.push(createEmptyMeasure())
	}
	const to = cloneMeasures(toMeasures)
	to.splice(insertAtStart ? 0 : to.length, 0, {
		...movedMeasure,
		cells: movedMeasure.cells.map(cell => ({ ...cell }))
	})
	return { from, to }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/lib/chordpro/measureOps.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: lint + 全テスト + コミット**

```bash
npm run lint && npm run test
git add src/lib/chordpro/measureOps.ts src/lib/chordpro/measureOps.test.ts
git commit -m "Extract measure operations into pure lib functions"
```

---

### Task 2: 曲メタ抽出の lib 関数化（stores/songs のパース排除）

**Files:**
- Modify: `src/lib/chordpro/parser.ts`（`extractSongMeta` 追加）
- Modify: `src/stores/songs.ts`（`fetchSongs` / `fetchSong` のインラインパースを置換）
- Test: `src/lib/chordpro/parser.test.ts`

**Interfaces:**
- Produces: `extractSongMeta(content: string): { title: string; artist: string; key?: string; capo?: number; tempo?: number; time?: string }`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/chordpro/parser.test.ts` に追加（import に `extractSongMeta` を追加）:

```ts
describe('extractSongMeta', () => {
	it('returns metadata without sections', () => {
		const meta = extractSongMeta(`{title: My Song}
{artist: Me}
{key: G}
{capo: 2}
{tempo: 96}
{time: 3/4}

{start_of_grid}
|| G . . ||
{end_of_grid}
`)
		expect(meta).toEqual({ title: 'My Song', artist: 'Me', key: 'G', capo: 2, tempo: 96, time: '3/4' })
	})
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/lib/chordpro/parser.test.ts`
Expected: FAIL（`extractSongMeta` が存在しない）

- [ ] **Step 3: 実装**

`parser.ts` の `generateChordPro` の後に追加:

```ts
/**
 * Extract song metadata only (no section structure) — for list/meta use in stores.
 */
export function extractSongMeta(content: string): {
	title: string
	artist: string
	key?: string
	capo?: number
	tempo?: number
	time?: string
} {
	const parsed = parseChordPro(content)
	return {
		title: parsed.title,
		artist: parsed.artist,
		key: parsed.key,
		capo: parsed.capo,
		tempo: parsed.tempo,
		time: parsed.time
	}
}
```

`src/stores/songs.ts`: import を `import { extractSongMeta } from '@/lib/chordpro/parser'` に変更し、`fetchSongs` 内の `parseChordPro(content)` 呼び出し（`title`/`artist`/`key` 抽出箇所）と `fetchSong` 内の同様の箇所を `extractSongMeta(content)` に置換する（挙動同一。フィールドの参照名は `parsed.title` → `meta.title` のように追随）。

- [ ] **Step 4: テストが通ることを確認 + lint + コミット**

```bash
npx vitest run src/lib/chordpro/parser.test.ts src/stores/songs.test.ts
npm run lint && npm run test
git add src/lib/chordpro/parser.ts src/lib/chordpro/parser.test.ts src/stores/songs.ts
git commit -m "Extract song metadata via dedicated lib function"
```

---

### Task 3: chordproEditor ストアの再編（唯一の編集 SoT）

**Files:**
- Modify: `src/stores/chordproEditor.ts`（全面書き換え）
- Create: `src/stores/chordproEditor.test.ts`

**Interfaces:**
- Consumes: Task 1 の `measureOps`、`autoAssignMeasures`（lib/parser）
- Produces（公開メンバー一覧 — これが Task 4/5 の前提）:
  - State/Getter: `document`, `sections`, `gridSections`
  - 文書: `loadDocument(content: string)`, `serialize(): string`
  - メタデータ: `updateMetadata(meta: { title: string; artist: string; key?: string; capo?: number; tempo?: number; time?: string })`
  - セクション: `updateSectionContent`, `updateSectionLabel`, `addGridSection`, `removeSection`, `moveSection`, `splitGridSection`（既存シグネチャ維持）
  - 小節: `addMeasure(sectionIndex, position, anchorIndex)`, `copyMeasure(sectionIndex, measureIndex)`, `deleteMeasure(sectionIndex, measureIndex)`, `clearLyrics(sectionIndex, measureIndex)`, `clearChords(sectionIndex, measureIndex)`, `swapMeasure(sectionIndex, measureIndex, direction)`, `mergeLyrics(sectionIndex, sourceIndex, direction)`, `reorderCells(sectionIndex, measureIndex, newOrder: number[])`
  - 移動: `moveCell(payload: { fromSectionIndex: number; toSectionIndex: number; fromMeasureIndex: number; toMeasureIndex: number; sourceCellIndex: number; newIndex: number | null })`（同一セクション/跨ぎ両対応）, `moveMeasureAcrossSections(fromSectionIndex, toSectionIndex, fromMeasureIndex)`（挿入位置は「後方セクションへは先頭、前方へは末尾」= 既存挙動）
  - 自動割り振り: `autoAssign(beatsPerMeasure: number)`
- **削除するメンバー**（監査でデッド確認済み + 本再編で不要化）: `selectedSectionIndex`, `selectedMeasureIndex`, `selectSection`, `selectMeasure`, `currentSection`, `currentGridSection`, `currentMeasures`, `totalMeasures`, `isDirty`, `markAsSaved`, `originalContent`, 旧 `addMeasure`/`deleteMeasure`/`updateMeasureCells`/`swapMeasures`, `extractMeasuresFromGrid`, `measuresToGridSection`
- 全小節アクションは不正インデックスで no-op（measureOps 側の保証 + `gridAt` ガード）

- [ ] **Step 1: 失敗するテストを書く**

`src/stores/chordproEditor.test.ts` を作成:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChordProEditorStore } from './chordproEditor'
import type { GridSection } from '@/lib/chordpro/types'

const CONTENT = `{title: Test}
{artist: A}
{time: 4/4}

{start_of_grid label="One"}
{lyrics_hint: la | li}
|: G . | C . :|
{end_of_grid}

{start_of_grid label="Two"}
|| Am . | F . ||
{end_of_grid}
`

function grid(store: ReturnType<typeof useChordProEditorStore>, sectionIndex: number): GridSection {
	return store.document!.sections[sectionIndex]!.content as GridSection
}

describe('chordproEditor store', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('loads and serializes a document', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		expect(store.gridSections.length).toBe(2)
		const out = store.serialize()
		expect(out).toContain('{lyrics_hint: la | li}')
		expect(out).toContain('|: G . | C . :|')
	})

	it('updates metadata directly on the document', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.updateMetadata({ title: 'New', artist: 'B', key: 'G', capo: 2, tempo: 100, time: '3/4' })
		const out = store.serialize()
		expect(out).toContain('{title: New}')
		expect(out).toContain('{key: G}')
		expect(out).toContain('{capo: 2}')
		expect(out).toContain('{tempo: 100}')
		expect(out).toContain('{time: 3/4}')
	})

	it('adds/deletes/swaps measures preserving bars', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.addMeasure(0, 'after', 0)
		expect(grid(store, 0).measures.length).toBe(3)
		expect(grid(store, 0).measures[0]!.startBar).toBe('repeatStart')
		expect(grid(store, 0).measures[2]!.endBar).toBe('repeatEnd')
		store.deleteMeasure(0, 1)
		expect(grid(store, 0).measures.length).toBe(2)
		store.swapMeasure(0, 0, 'right')
		expect(grid(store, 0).measures[1]!.startBar).toBe('repeatStart')
	})

	it('is a no-op on invalid indices and non-grid sections', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		const before = JSON.parse(JSON.stringify(store.document))
		store.addMeasure(99, 'end', null)
		store.deleteMeasure(0, 99)
		store.moveCell({ fromSectionIndex: 0, toSectionIndex: 99, fromMeasureIndex: 0, toMeasureIndex: 0, sourceCellIndex: 0, newIndex: 0 })
		expect(JSON.parse(JSON.stringify(store.document))).toEqual(before)
	})

	it('moves a cell across sections in one action', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.moveCell({
			fromSectionIndex: 0,
			toSectionIndex: 1,
			fromMeasureIndex: 0,
			toMeasureIndex: 0,
			sourceCellIndex: 0,
			newIndex: 1
		})
		expect(grid(store, 0).measures[0]!.cells.map(c => c.type)).toEqual(['empty'])
		expect(grid(store, 1).measures[0]!.cells.map(c => c.value)).toEqual(['Am', 'G'])
	})

	it('moves a measure to the next section head, preserving bars', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.moveMeasureAcrossSections(0, 1, 0)
		expect(grid(store, 0).measures.length).toBe(1)
		expect(grid(store, 1).measures.length).toBe(3)
		expect(grid(store, 1).measures[0]!.startBar).toBe('repeatStart')
		expect(grid(store, 1).measures[0]!.lyricsHint).toBe('la')
	})

	it('auto-assigns chord-only lyrics lines into grids', () => {
		const store = useChordProEditorStore()
		store.loadDocument(`{start_of_verse}
[C]hello [G]world
{end_of_verse}
`)
		store.autoAssign(4)
		expect(store.gridSections.length).toBeGreaterThan(0)
	})
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/stores/chordproEditor.test.ts`
Expected: FAIL（新アクションが存在しない）

- [ ] **Step 3: 実装（ファイル全体を置換）**

```ts
/**
 * ChordPro Editor Store
 * 編集の唯一の Source of Truth。全ミューテーションはここを経由する。
 * parse/generate は loadDocument / serialize / autoAssign のみで実行される。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
	generateChordPro,
	parseChordProToExtended,
	autoAssignMeasures as applyAutoAssignMeasures
} from '@/lib/chordpro/parser'
import {
	addMeasure as opAddMeasure,
	copyMeasure as opCopyMeasure,
	deleteMeasure as opDeleteMeasure,
	clearLyrics as opClearLyrics,
	clearChords as opClearChords,
	swapMeasure as opSwapMeasure,
	mergeLyrics as opMergeLyrics,
	reorderCells as opReorderCells,
	moveCellWithinGrid,
	moveCellAcrossGrids,
	moveMeasureAcrossGrids
} from '@/lib/chordpro/measureOps'
import type { ParsedSong, GridSection, Measure } from '@/lib/chordpro/types'

export interface MoveCellActionPayload {
	fromSectionIndex: number
	toSectionIndex: number
	fromMeasureIndex: number
	toMeasureIndex: number
	sourceCellIndex: number
	newIndex: number | null
}

export interface SongMetadataInput {
	title: string
	artist: string
	key?: string
	capo?: number
	tempo?: number
	time?: string
}

export const useChordProEditorStore = defineStore('chordproEditor', () => {
	// State
	const document = ref<ParsedSong | null>(null)

	// Getters
	const sections = computed(() => document.value?.sections ?? [])

	const gridSections = computed(() =>
		sections.value
			.map((section, index) => ({ section, index }))
			.filter(({ section }) => section.content.kind === 'grid')
	)

	// Internal helpers
	function gridAt(sectionIndex: number): GridSection | null {
		const section = document.value?.sections[sectionIndex]
		if (!section || section.content.kind !== 'grid') return null
		return section.content as GridSection
	}

	function setGridMeasures(sectionIndex: number, measures: Measure[]) {
		const grid = gridAt(sectionIndex)
		if (!grid || !document.value) return
		document.value.sections[sectionIndex]!.content = { ...grid, measures }
	}

	// Document actions
	function loadDocument(content: string) {
		document.value = parseChordProToExtended(content)
	}

	function serialize(): string {
		if (!document.value) return ''
		return generateChordPro(document.value)
	}

	function updateMetadata(meta: SongMetadataInput) {
		if (!document.value) return
		document.value.title = meta.title
		document.value.artist = meta.artist
		document.value.key = meta.key || undefined
		document.value.capo = Number.isFinite(meta.capo) ? meta.capo : undefined
		document.value.tempo = Number.isFinite(meta.tempo) ? meta.tempo : undefined
		document.value.time = meta.time || undefined
	}

	function autoAssign(beatsPerMeasure: number) {
		if (!document.value) return
		document.value = applyAutoAssignMeasures(document.value, beatsPerMeasure)
	}

	// Section actions
	function updateSectionContent(index: number, content: GridSection) {
		if (!document.value || !document.value.sections[index]) return
		document.value.sections[index]!.content = content
	}

	function updateSectionLabel(index: number, label: string | undefined) {
		if (!document.value || !document.value.sections[index]) return
		document.value.sections[index]!.label = label
	}

	function addGridSection(afterIndex?: number, label?: string) {
		if (!document.value) return
		const newSection = {
			type: 'grid' as const,
			label,
			content: {
				kind: 'grid' as const,
				measures: [{ cells: [{ type: 'empty' as const }] }]
			}
		}
		const insertIndex = afterIndex !== undefined ? afterIndex + 1 : document.value.sections.length
		document.value.sections.splice(insertIndex, 0, newSection)
	}

	function removeSection(index: number) {
		if (!document.value) return
		if (index < 0 || index >= document.value.sections.length) return
		document.value.sections.splice(index, 1)
	}

	function moveSection(index: number, direction: 'up' | 'down') {
		if (!document.value) return
		const targetIndex = direction === 'up' ? index - 1 : index + 1
		if (targetIndex < 0 || targetIndex >= document.value.sections.length) return
		const list = document.value.sections
		const temp = list[index]
		list[index] = list[targetIndex]!
		list[targetIndex] = temp!
	}

	function splitGridSection(index: number, measureIndex: number, label?: string) {
		if (!document.value) return
		const grid = gridAt(index)
		if (!grid) return
		if (measureIndex < 0 || measureIndex >= grid.measures.length - 1) return

		const leftMeasures = grid.measures.slice(0, measureIndex + 1)
		const rightMeasures = grid.measures.slice(measureIndex + 1)

		document.value.sections[index]!.content = { ...grid, measures: leftMeasures }
		document.value.sections.splice(index + 1, 0, {
			type: 'grid' as const,
			label,
			content: { kind: 'grid' as const, shape: grid.shape, measures: rightMeasures }
		})
	}

	// Measure actions（不正インデックスは no-op）
	function addMeasure(sectionIndex: number, position: 'end' | 'before' | 'after', anchorIndex: number | null) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opAddMeasure(grid.measures, position, anchorIndex))
	}

	function copyMeasure(sectionIndex: number, measureIndex: number) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opCopyMeasure(grid.measures, measureIndex))
	}

	function deleteMeasure(sectionIndex: number, measureIndex: number) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opDeleteMeasure(grid.measures, measureIndex))
	}

	function clearLyrics(sectionIndex: number, measureIndex: number) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opClearLyrics(grid.measures, measureIndex))
	}

	function clearChords(sectionIndex: number, measureIndex: number) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opClearChords(grid.measures, measureIndex))
	}

	function swapMeasure(sectionIndex: number, measureIndex: number, direction: 'left' | 'right') {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opSwapMeasure(grid.measures, measureIndex, direction))
	}

	function mergeLyrics(sectionIndex: number, sourceIndex: number, direction: 'left' | 'right') {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opMergeLyrics(grid.measures, sourceIndex, direction))
	}

	function reorderCells(sectionIndex: number, measureIndex: number, newOrder: number[]) {
		const grid = gridAt(sectionIndex)
		if (!grid) return
		setGridMeasures(sectionIndex, opReorderCells(grid.measures, measureIndex, newOrder))
	}

	function moveCell(payload: MoveCellActionPayload) {
		if (payload.fromSectionIndex === payload.toSectionIndex) {
			const grid = gridAt(payload.fromSectionIndex)
			if (!grid) return
			setGridMeasures(payload.fromSectionIndex, moveCellWithinGrid(grid.measures, payload))
			return
		}
		const fromGrid = gridAt(payload.fromSectionIndex)
		const toGrid = gridAt(payload.toSectionIndex)
		if (!fromGrid || !toGrid) return
		const result = moveCellAcrossGrids(fromGrid.measures, toGrid.measures, payload)
		if (!result) return
		setGridMeasures(payload.fromSectionIndex, result.from)
		setGridMeasures(payload.toSectionIndex, result.to)
	}

	function moveMeasureAcrossSections(fromSectionIndex: number, toSectionIndex: number, fromMeasureIndex: number) {
		if (fromSectionIndex === toSectionIndex) return
		const fromGrid = gridAt(fromSectionIndex)
		const toGrid = gridAt(toSectionIndex)
		if (!fromGrid || !toGrid) return
		const insertAtStart = toSectionIndex > fromSectionIndex
		const result = moveMeasureAcrossGrids(fromGrid.measures, toGrid.measures, fromMeasureIndex, insertAtStart)
		if (!result) return
		setGridMeasures(fromSectionIndex, result.from)
		setGridMeasures(toSectionIndex, result.to)
	}

	return {
		// State
		document,
		// Getters
		sections,
		gridSections,
		// Document
		loadDocument,
		serialize,
		updateMetadata,
		autoAssign,
		// Sections
		updateSectionContent,
		updateSectionLabel,
		addGridSection,
		removeSection,
		moveSection,
		splitGridSection,
		// Measures
		addMeasure,
		copyMeasure,
		deleteMeasure,
		clearLyrics,
		clearChords,
		swapMeasure,
		mergeLyrics,
		reorderCells,
		moveCell,
		moveMeasureAcrossSections
	}
})
```

**注意**: この時点で `SongEditPage.vue` は `editorStore.markAsSaved()` を呼んでおりコンパイルが壊れる。同一コミット内で `SongEditPage.vue:67` の `editorStore.markAsSaved()` 行を削除する（保存フローの本格改修は Task 5。この行は `originalContent` 更新のみで、`isDirty` が消えた今は完全に無意味）。`useChordProEditorSync` と `useGridSectionManager` はストアの維持メンバーのみに依存しているため無傷。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/stores/chordproEditor.test.ts && npm run build`
Expected: テスト PASS、`vue-tsc` ビルド成功（削除メンバーへの残存参照があればここで発覚）

- [ ] **Step 5: lint + 全テスト + コミット**

```bash
npm run lint && npm run test
git add src/stores/chordproEditor.ts src/stores/chordproEditor.test.ts src/pages/SongEditPage.vue
git commit -m "Rebuild chordproEditor store as the single editing source of truth"
```

---

### Task 4: GridEditor をストア直結に（選択状態の一本化・二重実装の削除）

**Files:**
- Create: `src/components/song/composables/useEditableMeasures.ts`
- Modify: `src/components/song/GridEditor.vue`（script 全面書き換え + template 一部）
- Modify: `src/pages/SongEditPage.vue`（`handleMoveAcrossSections` / `handleMoveMeasureAcrossSections` 削除、GridEditor バインディング変更）
- Modify: `src/pages/song-edit/composables/useGridSectionManager.ts`（`updateGridSection` 削除）
- Delete: `src/components/song/composables/useGridMeasureEditor.ts` + `.test.ts`、`src/components/song/composables/useGridMeasureActions.ts` + `.test.ts`
- Modify: `EditableMeasure` 型の import 元を参照している箇所（`grep -rn "EditableMeasure" src/` で特定し、`useEditableMeasures` からの import に付け替え。`GridMeasureList.vue` / `GridMeasureItem.vue` が該当するはず）

**Interfaces:**
- Consumes: Task 3 のストアアクション群
- Produces:
  - `useEditableMeasures(measures: ComputedRef<Measure[]>): { displayMeasures: ComputedRef<EditableMeasure[]> }`（セル id 形式 `${measureIndex}-${cellIndex}-${suffix}` は現行と同一 — GridMeasureList/Item の drag 実装が依存）
  - GridEditor の新 Props: `modelValue: GridSection`, `sectionIndex: number`, `prevSectionIndex: number | null`, `nextSectionIndex: number | null`, `selectedMeasureIndex: number | null`
  - GridEditor の Emits: `select-measure` のみ（`update:modelValue` / `move-cell-across-section` / `move-measure-across-section` は廃止 — ミューテーションはストア直呼び）
- 選択状態は `useGridSectionManager.selectedMeasureBySection` の1箇所のみ。GridEditor はローカル `ref` を持たない

- [ ] **Step 1: useEditableMeasures を作成（テストとも）**

`src/components/song/composables/useEditableMeasures.ts`:

```ts
import { computed, type ComputedRef } from 'vue'
import type { GridCell, Measure } from '@/lib/chordpro/types'

export interface EditableMeasure extends Measure {
	cells: ({ id: string } & GridCell)[]
}

export function useEditableMeasures(measures: ComputedRef<Measure[]>) {
	const displayMeasures = computed<EditableMeasure[]>(() =>
		measures.value.map((measure, index) => ({
			...measure,
			cells: measure.cells.map((cell, cellIndex) => ({
				id: `${index}-${cellIndex}-${cell.type === 'chord' ? cell.value ?? 'chord' : cell.type}`,
				...cell
			}))
		}))
	)

	return { displayMeasures }
}
```

`src/components/song/composables/useEditableMeasures.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computed } from 'vue'
import { useEditableMeasures } from './useEditableMeasures'
import type { Measure } from '@/lib/chordpro/types'

describe('useEditableMeasures', () => {
	it('assigns stable ids embedding measure and cell indices', () => {
		const measures = computed<Measure[]>(() => [
			{ cells: [{ type: 'chord', value: 'G' }, { type: 'empty' }], startBar: 'repeatStart' }
		])
		const { displayMeasures } = useEditableMeasures(measures)
		expect(displayMeasures.value[0]!.cells.map(c => c.id)).toEqual(['0-0-G', '0-1-empty'])
		expect(displayMeasures.value[0]!.startBar).toBe('repeatStart')
	})
})
```

Run: `npx vitest run src/components/song/composables/useEditableMeasures.test.ts` → PASS

- [ ] **Step 2: GridEditor.vue の script を置換**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useChordProEditorStore } from '@/stores/chordproEditor'
import { useEditableMeasures } from '@/components/song/composables/useEditableMeasures'
import type { GridSection } from '@/lib/chordpro/types'
import GridMeasureList from '@/components/song/GridMeasureList.vue'

interface Props {
  modelValue: GridSection
  sectionIndex: number
  prevSectionIndex: number | null
  nextSectionIndex: number | null
  selectedMeasureIndex: number | null
}

interface Emits {
  (e: 'select-measure', value: number | null): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const store = useChordProEditorStore()

const measures = computed(() => props.modelValue.measures ?? [])
const { displayMeasures } = useEditableMeasures(measures)

function cellIndexFromId(id: string | null, fallback: number | null): number {
  if (id) {
    const parsed = Number.parseInt(id.split('-')[1] ?? '', 10)
    if (!Number.isNaN(parsed)) return parsed
  }
  return typeof fallback === 'number' ? fallback : -1
}

function selectMeasure(index: number) {
  emit('select-measure', props.selectedMeasureIndex === index ? null : index)
}

function handleAddMeasure(position: 'end' | 'before' | 'after') {
  store.addMeasure(props.sectionIndex, position, props.selectedMeasureIndex)
}

function handleCopyMeasure() {
  if (props.selectedMeasureIndex === null) return
  store.copyMeasure(props.sectionIndex, props.selectedMeasureIndex)
}

function handleDeleteMeasure() {
  if (props.selectedMeasureIndex === null) return
  store.deleteMeasure(props.sectionIndex, props.selectedMeasureIndex)
  emit('select-measure', null)
}

function handleDeleteLyrics() {
  if (props.selectedMeasureIndex === null) return
  store.clearLyrics(props.sectionIndex, props.selectedMeasureIndex)
}

function handleDeleteChords() {
  if (props.selectedMeasureIndex === null) return
  store.clearChords(props.sectionIndex, props.selectedMeasureIndex)
}

function handleSwapMeasure(direction: 'left' | 'right') {
  const current = props.selectedMeasureIndex
  if (current === null) return
  const target = direction === 'left' ? current - 1 : current + 1
  if (target < 0 || target >= measures.value.length) return
  store.swapMeasure(props.sectionIndex, current, direction)
  emit('select-measure', target)
}

function handleMergeLyrics(direction: 'left' | 'right', sourceIndex: number) {
  store.mergeLyrics(props.sectionIndex, sourceIndex, direction)
}

function handleReorder(measureIndex: number, orderedCellIds: string[]) {
  const newOrder = orderedCellIds.map(id => cellIndexFromId(id, null))
  store.reorderCells(props.sectionIndex, measureIndex, newOrder)
}

function handleMoveCell(payload: {
  fromSectionIndex: number
  toSectionIndex: number
  fromMeasureIndex: number
  toMeasureIndex: number
  fromOrder: string[]
  toOrder: string[]
  movedCellId: string | null
  oldIndex: number | null
  newIndex: number | null
}) {
  const sourceCellIndex = cellIndexFromId(payload.movedCellId, payload.oldIndex)
  if (sourceCellIndex < 0) return
  store.moveCell({
    fromSectionIndex: payload.fromSectionIndex,
    toSectionIndex: payload.toSectionIndex,
    fromMeasureIndex: payload.fromMeasureIndex,
    toMeasureIndex: payload.toMeasureIndex,
    sourceCellIndex,
    newIndex: payload.newIndex
  })
}

function handleMoveSection(payload: { direction: 'prev' | 'next'; measureIndex: number }) {
  const targetSectionIndex = payload.direction === 'prev'
    ? props.prevSectionIndex
    : props.nextSectionIndex
  if (targetSectionIndex === null) return
  store.moveMeasureAcrossSections(props.sectionIndex, targetSectionIndex, payload.measureIndex)
}
</script>
```

template は既存のまま（`GridMeasureList` のバインディングは同名ハンドラで維持）。`:selected-measure-index="selectedMeasureIndex"` は props 由来になる。

- [ ] **Step 3: SongEditPage.vue を追随**

- `handleMoveAcrossSections`（99-176行）と `handleMoveMeasureAcrossSections`（178-216行）を**削除**（ストアの `moveCell` / `moveMeasureAcrossSections` に一本化された）
- GridEditor バインディングを変更:

```vue
              <GridEditor
                :model-value="(section.content as GridSection)"
                :section-index="index"
                :prev-section-index="gridSections[gridIndex - 1]?.index ?? null"
                :next-section-index="gridSections[gridIndex + 1]?.index ?? null"
                :selected-measure-index="getSelectedMeasure(index)"
                @select-measure="(val) => setSelectedMeasure(index, val)"
              />
```

- `useGridSectionManager` の destructure に `getSelectedMeasure` を追加し、`updateGridSection` を外す。script から `GridCell` import と不要になった型を削除
- `useGridSectionManager.ts` から `updateGridSection` 関数と return エントリを削除（唯一の呼び出し元が消えるため）

- [ ] **Step 4: 旧コンポーザブルの削除と型付け替え**

```bash
git rm src/components/song/composables/useGridMeasureEditor.ts src/components/song/composables/useGridMeasureEditor.test.ts
git rm src/components/song/composables/useGridMeasureActions.ts src/components/song/composables/useGridMeasureActions.test.ts
grep -rn "EditableMeasure\|useGridMeasureEditor\|useGridMeasureActions" src/
```

grep で見つかった `EditableMeasure` の import（`GridMeasureList.vue` / `GridMeasureItem.vue` 想定）を `@/components/song/composables/useEditableMeasures` に付け替える。他の残存参照は 0 件であること。

- [ ] **Step 5: ビルド + lint + 全テスト + コミット**

```bash
npm run build && npm run lint && npm run test
git add -A src/
git commit -m "Route all measure edits through the editor store"
```

**手動確認（このタスク完了時に必須）**: `VITE_API_ENDPOINT="" VITE_S3_BUCKET="" npm run dev` でビジュアルエディタの一通りの操作（選択、追加、複製、削除、左右入替、歌詞削除/マージ、セル並び替えドラッグ、セクション跨ぎのセル移動・小節移動）が動き、テキストモードに切り替えると結果が反映されていること。※この時点では deep watcher（useChordProEditorSync）がまだ生きているため、従来どおり同期される。

---

### Task 5: 同期 watcher の廃止とモード切替・保存フローの再構築

**Files:**
- Modify: `src/pages/SongEditPage.vue`（editMode 切替・save・autoAssign）
- Modify: `src/pages/song-edit/composables/useSongEditForm.ts`（`applyMetadataToContent` 廃止、`save(finalContent)` 化）
- Delete: `src/pages/song-edit/composables/useChordProEditorSync.ts` + `.test.ts`
- Modify: `src/pages/song-edit/composables/useSongEditForm.test.ts`（save の新シグネチャに追随）

**Interfaces:**
- Consumes: Task 3 の `loadDocument` / `serialize` / `updateMetadata` / `autoAssign`
- Produces:
  - `useSongEditForm(...).save(finalContent: string): Promise<Song | undefined>` — `content.value = finalContent` を設定してから永続化。`applyMetadataToContent` と `parseChordPro`/`generateChordPro` の import は消える
  - SongEditPage の規約: **ビジュアルモード中の SoT はストア、テキストモード中の SoT は `content` 文字列**。変換はモード切替時と保存時のみ

- [ ] **Step 1: useSongEditForm を書き換え**

`applyMetadataToContent` を削除し、`save` を置換:

```ts
	async function save(finalContent: string) {
		saving.value = true
		try {
			content.value = finalContent
			const song = formSong.value
			await options.songsStore.saveSong(song)
			return song
		} finally {
			saving.value = false
		}
	}
```

import から `generateChordPro, parseChordPro` を削除。`useSongEditForm.test.ts` の save 関連テストを新シグネチャ（`save('{title: X}\n...')` のように内容を渡す）に追随させ、「メタデータが content に書き戻される」ことを検証していたテストがあれば削除する（その責務はストアの `updateMetadata` テストに移管済み）。

Run: `npx vitest run src/pages/song-edit/composables/useSongEditForm.test.ts` → PASS

- [ ] **Step 2: SongEditPage.vue のフロー書き換え**

- import から `useChordProDocument`, `useChordProEditorSync` を削除
- `const { autoAssignMeasuresToContent } = useChordProDocument({ content })` と `useChordProEditorSync({ content, editorStore })` を削除
- 以下に置換:

```ts
onMounted(async () => {
  await loadSong()
  editorStore.loadDocument(content.value)
})

type EditMode = 'text' | 'visual'
const editMode = ref<EditMode>('visual')

function setEditMode(mode: EditMode) {
  if (mode === editMode.value) return
  if (mode === 'text') {
    content.value = editorStore.serialize()
  } else {
    editorStore.loadDocument(content.value)
  }
  editMode.value = mode
}

function collectMetadata() {
  return {
    title: title.value || 'Untitled',
    artist: artist.value,
    key: key.value,
    capo: capo.value,
    tempo: tempo.value,
    time: time.value
  }
}

async function save() {
  if (editMode.value === 'text') {
    editorStore.loadDocument(content.value)
  }
  editorStore.updateMetadata(collectMetadata())
  const song = await saveSong(editorStore.serialize())
  if (song) {
    router.push({ name: 'song-detail', params: { id: song.id } })
  }
}

function handleAutoAssignMeasures() {
  if (editMode.value === 'text') {
    editorStore.loadDocument(content.value)
  }
  editorStore.autoAssign(beatsPerMeasure.value)
  if (editMode.value === 'text') {
    content.value = editorStore.serialize()
  }
}
```

- template のモード切替ボタンを `@click="setEditMode('visual')"` / `@click="setEditMode('text')"` に変更（既存の `editMode = 'visual'` 直代入をやめる）
- 既存の `editMode` ref 定義（旧位置）と旧 `save`/`handleAutoAssignMeasures` を削除

- [ ] **Step 3: useChordProEditorSync の削除**

```bash
git rm src/pages/song-edit/composables/useChordProEditorSync.ts src/pages/song-edit/composables/useChordProEditorSync.test.ts
grep -rn "useChordProEditorSync" src/
```

Expected: grep 0件。

- [ ] **Step 4: ビルド + lint + 全テスト + コミット**

```bash
npm run build && npm run lint && npm run test
git add -A src/
git commit -m "Parse and serialize only on mode switch and save"
```

**手動確認（必須）**: dev サーバーで (1) ビジュアル編集→テキスト切替で反映、(2) テキスト編集→ビジュアル切替で反映、(3) ビジュアル編集→そのまま保存→詳細表示が正しい、(4) テキスト編集→そのまま保存→正しい、(5) メタデータ（タイトル等）変更のみ→保存→歌詞ヒント/リピート記号が壊れていない、(6) 自動割り振りボタンが両モードで機能、を確認。

---

### Task 6: 保存失敗の可視化

**Files:**
- Modify: `src/pages/SongEditPage.vue`（save の catch + エラー表示）

**Interfaces:**
- Consumes: `songsStore.error`（`saveSong` 失敗時に設定され、成功時に null クリアされる既存挙動）
- 背景: 実機検証で「API 到達不能時に保存が unhandled rejection で静かに失敗し、UI が無反応」という既存問題を確認済み（Phase 1 検証記録）

- [ ] **Step 1: save に catch を追加**

Task 5 の `save()` を以下に変更:

```ts
async function save() {
  if (editMode.value === 'text') {
    editorStore.loadDocument(content.value)
  }
  editorStore.updateMetadata(collectMetadata())
  try {
    const song = await saveSong(editorStore.serialize())
    if (song) {
      router.push({ name: 'song-detail', params: { id: song.id } })
    }
  } catch {
    // songsStore.error に詳細が入る。ここでは遷移しないことが本質
  }
}
```

- [ ] **Step 2: エラー表示を追加**

template の `<header>` 直後に:

```vue
    <div v-if="songsStore.error" class="save-error" role="alert">
      保存に失敗しました: {{ songsStore.error }}
    </div>
```

style に:

```css
.save-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
  padding: var(--spacing-sm) var(--spacing-md);
  margin: var(--spacing-sm) var(--spacing-md) 0;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
}
```

- [ ] **Step 3: 手動確認 + lint + テスト + コミット**

dev サーバー（API 有効の素の `npm run dev`）で保存し、ネットワーク失敗時にエラーバナーが出て画面遷移しないこと、中和サーバーでは正常保存できることを確認。

```bash
npm run lint && npm run test
git add src/pages/SongEditPage.vue
git commit -m "Surface save failures in the edit page"
```

---

### Task 7: gridMeasuresToLine の空セル小節ガード

**Files:**
- Modify: `src/lib/chordpro/parser.ts`（`gridMeasuresToLine`）
- Test: `src/lib/chordpro/roundtrip.test.ts`

**Interfaces:**
- 背景: Phase 1 最終レビューの繰越項目。`cells: []` の小節は連続バートークンとして出力され、再パースで消滅する（ヒントが隣にずれる）。パーサ・エディタからは現状生成されないが、防御として `.` を出力し小節数を保存する

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/chordpro/roundtrip.test.ts` に追加:

```ts
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
```

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run src/lib/chordpro/roundtrip.test.ts`
Expected: FAIL（measures.length が 2 になる）

- [ ] **Step 3: 実装**

`gridMeasuresToLine` 内の `tokens.push(...measure.cells.map(cellToString))` を置換:

```ts
		const cellTokens = measure.cells.length > 0 ? measure.cells.map(cellToString) : ['.']
		tokens.push(...cellTokens)
```

- [ ] **Step 4: PASS 確認 + lint + 全テスト + コミット**

```bash
npx vitest run src/lib/chordpro/roundtrip.test.ts
npm run lint && npm run test
git add src/lib/chordpro/parser.ts src/lib/chordpro/roundtrip.test.ts
git commit -m "Emit placeholder beat for empty measures in generateChordPro"
```

---

### Task 8: 最終スイープ（残デッドコード・整合確認）

**Files:**
- Modify: `src/composables/useChordProDocument.ts`（`autoAssignMeasuresToContent` 削除 — 唯一の利用者が Task 5 で消えた）
- Modify: `src/composables/useChordProDocument.test.ts`（該当テスト削除）
- 確認のみ: 残存参照 grep、ビルド、全テスト

**Interfaces:**
- Consumes: Task 1-7 完了
- Produces: spec の責務マップどおりのコードベース（編集系の parse/generate 呼び出しは chordproEditor ストア内のみ）

- [ ] **Step 1: useChordProDocument から編集用機能を削除**

- `autoAssignMeasuresToContent` 関数・interface エントリ・return エントリを削除
- import から `autoAssignMeasures`, `generateChordPro`, `parseChordPro` のうち未使用になるものを削除（`serialize` が `generateChordPro` を使い続ける点に注意 — 閲覧側の `serialize`/`setContent` はここでは触らない）
- `useChordProDocument.test.ts` の `autoAssignMeasuresToContent` 関連テストを削除

- [ ] **Step 2: 残存参照の網羅確認**

```bash
grep -rn "useGridMeasureEditor\|useGridMeasureActions\|useChordProEditorSync\|applyMetadataToContent\|markAsSaved\|isDirty\|selectedSectionIndex\|selectMeasure(\|updateMeasureCells\|swapMeasures\|autoAssignMeasuresToContent\|updateGridSection" src/
```

Expected: 0件（`selectedMeasureBySection` / `setSelectedMeasure` / `getSelectedMeasure` は残って正しい — パターンに含めない）

- [ ] **Step 3: ビルド + lint + 全テスト**

Run: `npm run build && npm run lint && npm run test`
Expected: すべて成功

- [ ] **Step 4: コミット**

```bash
git add -A src/
git commit -m "Remove remaining editor sync dead code"
```

---

## 完了条件（Phase 2 全体）

- `npm run build && npm run lint && npm run test` がすべて成功
- Task 8 Step 2 の grep が 0 件
- 編集系の `parseChordPro*` / `generateChordPro` 呼び出しが `stores/chordproEditor.ts` の中（`loadDocument`/`serialize`/`autoAssign`）にのみ存在する（`lib` 内部と閲覧側 `useChordProDocument.parsedSong`/`serialize`、`stores/songs.ts` の `extractSongMeta` は除く）
- 手動確認（中和 dev サーバー）: ビジュアル/テキスト両モードの編集・切替・保存・自動割り振りが動作し、`|:` `:|` / 小節単位ヒント / `/` が全操作を通じて保持される。API 到達不能時に保存エラーが表示される
- Phase 3（表示・ハイライトの一貫性）の計画作成に着手できる状態
