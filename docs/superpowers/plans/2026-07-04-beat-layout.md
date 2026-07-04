# 小節内の拍解釈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** セル→拍の対応規則（均等割り + 先頭詰め）を純関数として実装し、閲覧・エディタ両方のセル幅に反映、解釈不能な小節にはエディタで警告を表示する。

**Architecture:** 新規 `lib/chordpro/beatLayout.ts` の `measureBeatLayout` が唯一の規則実装。GridView / GridMeasureItem はそれを使ってセルの `flex-grow` を拍数にし、小節ボディの基準幅を `拍単位幅 × B` にする。`beatsPerMeasure` は既存の供給源（Detail: `useChordProDocument`、Edit: `useBeatSignature`）から props で配る。再生エンジンは無変更。

**Tech Stack:** Vue 3 + Vitest（environment: node）。新規依存なし。

**Spec:** `docs/superpowers/specs/2026-07-04-beat-layout-design.md`

**Branch:** `feature/beat-layout`（main から作成）

## Global Constraints

- `.ts` ファイルはタブインデント・シングルクォート・セミコロンなし。`.vue` は2スペース
- コミット前に必ず `npm run lint` と `npm run test` を実行し、両方成功を確認する
- 保存形式・パース結果・再生タイミングは一切変更しない（表示とエディタ警告のみ）
- 規則の実装は `measureBeatLayout` の1箇所。ビューはこれを呼ぶだけで、拍計算を自前でしない

---

### Task 1: measureBeatLayout 純関数

**Files:**
- Create: `src/lib/chordpro/beatLayout.ts`
- Create: `src/lib/chordpro/beatLayout.test.ts`

**Interfaces:**
- Produces: `measureBeatLayout(cellCount: number, beatsPerMeasure: number): { beats: number[]; irregular: boolean }`
  - `beats.length === cellCount`、合計は常に `beatsPerMeasure`（`cellCount > 0` のとき）
  - `irregular: true` は「規則で解釈不能・均等割りフォールバック」の意味

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/chordpro/beatLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { measureBeatLayout } from './beatLayout'

describe('measureBeatLayout', () => {
	it('splits evenly when the beat count is divisible by the cell count', () => {
		expect(measureBeatLayout(1, 4)).toEqual({ beats: [4], irregular: false })
		expect(measureBeatLayout(2, 4)).toEqual({ beats: [2, 2], irregular: false })
		expect(measureBeatLayout(4, 4)).toEqual({ beats: [1, 1, 1, 1], irregular: false })
		expect(measureBeatLayout(3, 3)).toEqual({ beats: [1, 1, 1], irregular: false })
	})

	it('front-loads the remainder when fewer cells than beats do not divide', () => {
		expect(measureBeatLayout(3, 4)).toEqual({ beats: [2, 1, 1], irregular: false })
		expect(measureBeatLayout(2, 3)).toEqual({ beats: [2, 1], irregular: false })
	})

	it('splits into sub-beats when the cell count is a multiple of the beats', () => {
		expect(measureBeatLayout(8, 4)).toEqual({
			beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
			irregular: false
		})
	})

	it('falls back to an even split and flags irregular otherwise', () => {
		const result = measureBeatLayout(5, 4)
		expect(result.irregular).toBe(true)
		expect(result.beats.length).toBe(5)
		expect(result.beats.reduce((a, b) => a + b, 0)).toBeCloseTo(4)
	})

	it('handles empty and invalid inputs without throwing', () => {
		expect(measureBeatLayout(0, 4)).toEqual({ beats: [], irregular: false })
		expect(measureBeatLayout(2, 0)).toEqual({ beats: [], irregular: false })
	})
})
```

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run src/lib/chordpro/beatLayout.test.ts`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: 実装**

`src/lib/chordpro/beatLayout.ts`:

```ts
/**
 * 小節内のセルと拍の対応規則（docs/superpowers/specs/2026-07-04-beat-layout-design.md）
 * - 割り切れる場合は均等割り
 * - セル数 < 拍数で割り切れない場合は各1拍 + 余りを先頭セルへ
 * - セル数が拍数の倍数ならサブビートの均等割り
 * - それ以外は解釈不能（irregular）として均等割りフォールバック
 */
export interface MeasureBeatLayout {
	beats: number[]
	irregular: boolean
}

export function measureBeatLayout(cellCount: number, beatsPerMeasure: number): MeasureBeatLayout {
	if (cellCount <= 0 || beatsPerMeasure <= 0) {
		return { beats: [], irregular: false }
	}

	if (beatsPerMeasure % cellCount === 0) {
		return { beats: Array(cellCount).fill(beatsPerMeasure / cellCount), irregular: false }
	}

	if (cellCount < beatsPerMeasure) {
		const beats = Array(cellCount).fill(1)
		beats[0] = beatsPerMeasure - (cellCount - 1)
		return { beats, irregular: false }
	}

	if (cellCount % beatsPerMeasure === 0) {
		return { beats: Array(cellCount).fill(beatsPerMeasure / cellCount), irregular: false }
	}

	return { beats: Array(cellCount).fill(beatsPerMeasure / cellCount), irregular: true }
}
```

- [ ] **Step 4: PASS 確認 + lint + 全テスト + コミット**

```bash
npx vitest run src/lib/chordpro/beatLayout.test.ts
npm run lint && npm run test
git add src/lib/chordpro/beatLayout.ts src/lib/chordpro/beatLayout.test.ts
git commit -m "Add measure beat layout rules as a pure lib function"
```

---

### Task 2: GridView のセル幅を拍比例に

**Files:**
- Modify: `src/components/song/GridView.vue`
- Modify: `src/pages/SongDetailPage.vue`（`:beats-per-measure` を渡す）

**Interfaces:**
- Consumes: Task 1 の `measureBeatLayout`、SongDetailPage の既存 `beatsPerMeasure`（`useChordProDocument` 由来）
- Produces: GridView 新 prop `beatsPerMeasure?: number`（default 4）。`MeasureGroup` に `beats: number[]` が加わる

- [ ] **Step 1: GridView.vue の変更**

script:
- import に追加: `import { measureBeatLayout } from '@/lib/chordpro/beatLayout'`
- Props に `beatsPerMeasure?: number` を追加し、`withDefaults` に `beatsPerMeasure: 4` を追加
- `MeasureGroup` インターフェースに `beats: number[]` を追加
- `measureRows` の各 group 構築後に beats を付与する。`groups.push({...})` のオブジェクトに `beats: []` を入れておき、`row.forEach` の後・`return groups` の前に:

```ts
    groups.forEach((group) => {
      group.beats = measureBeatLayout(group.cells.length, props.beatsPerMeasure).beats
    })
```

template — セル div に拍比例スタイルを追加:

```vue
                <div
                  v-for="(cell, cellIndex) in group.cells"
                  :key="cellIndex"
                  class="grid-cell"
                  :class="getCellClass(cell)"
                  :style="{ flexGrow: String(group.beats[cellIndex] ?? 1) }"
                >
```

`grid-measure-body` に基準幅を追加:

```vue
              <div
                class="grid-measure-body"
                :style="{ minWidth: `calc(var(--grid-beat-unit) * ${beatsPerMeasure})` }"
              >
```

style — `.grid-cell` の固定 `min-width` を廃止して flex 化し、拍単位変数を定義:

```css
.chord-grid-container {
  /* 既存プロパティに追加 */
  --grid-beat-unit: 1.75rem;
}

.grid-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  flex-basis: 0;
  min-width: max-content;
  min-height: 2rem;
}
```

既存のメディアクエリ内 `.grid-cell { min-width: ... }` は削除し、代わりに:

```css
@media (min-width: 768px) {
  .chord-grid-container {
    --grid-beat-unit: 2rem;
  }
}

@media (min-width: 1024px) {
  .chord-grid-container {
    --grid-beat-unit: 2.25rem;
  }
}
```

（768px 内の `.grid-cell { font-size: 1rem }` 等、幅以外の既存指定は残す）

- [ ] **Step 2: SongDetailPage.vue の配線**

GridView バインディングに追加:

```vue
                :beats-per-measure="beatsPerMeasure"
```

（`beatsPerMeasure` は script に既存 — `useChordProDocument` の destructure 済み）

- [ ] **Step 3: ビルド + lint + 全テスト + コミット**

```bash
npm run build && npm run lint && npm run test
git add src/components/song/GridView.vue src/pages/SongDetailPage.vue
git commit -m "Scale grid cell widths by beat share in the song view"
```

---

### Task 3: エディタのセル幅反映と解釈不能警告

**Files:**
- Modify: `src/pages/SongEditPage.vue`（GridEditor に `:beats-per-measure` を渡す）
- Modify: `src/components/song/GridEditor.vue`（prop 中継）
- Modify: `src/components/song/GridMeasureList.vue`（prop 中継）
- Modify: `src/components/song/GridMeasureItem.vue`（拍比例幅 + ⚠ 警告）

**Interfaces:**
- Consumes: Task 1 の `measureBeatLayout`、SongEditPage の既存 `beatsPerMeasure`（`useBeatSignature` 由来）
- Produces: GridEditor / GridMeasureList / GridMeasureItem に `beatsPerMeasure: number` prop が通る。GridMeasureItem は `irregular` 時に `.beat-warning`（⚠ + title ツールチップ）を表示

- [ ] **Step 1: props の中継**

- `SongEditPage.vue`: GridEditor バインディングに `:beats-per-measure="beatsPerMeasure"` を追加（`beatsPerMeasure` は script に既存）
- `GridEditor.vue`: Props に `beatsPerMeasure: number` を追加し、GridMeasureList バインディングに `:beats-per-measure="beatsPerMeasure"` を追加
- `GridMeasureList.vue`: Props に `beatsPerMeasure: number` を追加し、GridMeasureItem バインディングに `:beats-per-measure="beatsPerMeasure"` を追加

- [ ] **Step 2: GridMeasureItem.vue の変更**

script:

```ts
import { measureBeatLayout } from '@/lib/chordpro/beatLayout'
```

Props に `beatsPerMeasure: number` を追加。computed を追加:

```ts
const beatLayout = computed(() => measureBeatLayout(props.measure.cells.length, props.beatsPerMeasure))
```

template — `.measure-cells` に基準幅、各セルに拍比例スタイル、警告マークを追加:

```vue
    <div
      class="measure-cells"
      :data-measure-index="measureIndex"
      :data-section-index="sectionIndex"
      :style="{ minWidth: `calc(var(--editor-beat-unit) * ${beatsPerMeasure})` }"
      @click="emit('select', measureIndex)"
    >
      <div
        v-for="(cell, cellIndex) in measure.cells"
        :key="cell.id"
        :data-id="cell.id"
        class="editable-cell"
        :class="getCellClass(cell)"
        :style="{ flexGrow: String(beatLayout.beats[cellIndex] ?? 1) }"
      >
        {{ cellGlyph(cell) }}
      </div>
    </div>
    <span
      v-if="beatLayout.irregular"
      class="beat-warning"
      title="セル数が拍子と合いません（例: 4/4 で5セル）。再生・表示は均等割りで扱われます"
    >⚠</span>
```

style — `.editable-cell` の固定 `min-width` を flex 化し、変数と警告スタイルを追加:

```css
.measure-wrapper {
  /* 既存プロパティに追加 */
  --editor-beat-unit: 2.5rem;
}

.editable-cell {
  /* min-width: 2.5rem を削除し、以下を追加 */
  flex-grow: 1;
  flex-basis: 0;
  min-width: max-content;
}

.beat-warning {
  position: absolute;
  top: -6px;
  right: -6px;
  font-size: 0.8rem;
  cursor: help;
}

@media (min-width: 768px) {
  .measure-wrapper {
    --editor-beat-unit: 3.5rem;
  }
}
```

（既存メディアクエリ内の `.editable-cell { min-width: 3.5rem }` は削除。`font-size: 1rem` 等は残す。`.measure-wrapper` は既に `position: relative`）

- [ ] **Step 3: ビルド + lint + 全テスト + コミット**

```bash
npm run build && npm run lint && npm run test
git add src/pages/SongEditPage.vue src/components/song/GridEditor.vue src/components/song/GridMeasureList.vue src/components/song/GridMeasureItem.vue
git commit -m "Reflect beat layout in the editor and warn on irregular measures"
```

---

### Task 4: docs 更新

**Files:**
- Modify: `docs/chordpro.md`

- [ ] **Step 1: 拍解釈の節を追加**

`## Lyrics Hints` の節の前に追加:

```markdown
## Beats per Cell

Within a grid measure, cells share the measure's beats (from `{time:}`):

- If the beat count is divisible by the cell count, cells split evenly:
  `| Bm |` is four beats of Bm in 4/4, `| Bm G |` is 2 + 2.
- With fewer cells than beats and no even split, each cell takes one beat
  and the FIRST cell absorbs the remainder: `| G A/G E |` in 4/4 reads
  G(2) A/G(1) E(1).
- If the cell count is a multiple of the beats, cells are even sub-beats:
  eight cells in 4/4 are eighth notes.
- Anything else (e.g. five cells in 4/4) cannot be interpreted; the editor
  shows a warning and rendering falls back to an even split.

A measure always lasts exactly its time-signature beats during playback.
Cell widths in the views are proportional to their beat share.
```

- [ ] **Step 2: 全テスト + コミット**

```bash
npm run lint && npm run test
git add docs/chordpro.md
git commit -m "Document beats-per-cell interpretation rules"
```

---

## 完了条件

- `npm run build && npm run lint && npm run test` がすべて成功
- 実機確認（中和 dev サーバー）:
  - `| Bm |` を含む小節が他の4拍小節と同じ内容幅で表示され、`| G A/G E |` の G セルが約2倍幅（閲覧・エディタ両方）
  - 4/4 で5セルの小節にエディタで ⚠ が表示され、ツールチップが読める。保存は通る
  - ドラッグ並び替え・セル移動が引き続き動作（flex 化の副作用がない）
  - 再生タイミング・ハイライトが従来どおり
