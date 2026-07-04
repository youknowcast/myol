# 再生修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 再生クロックを実時計ベースにし、自動スクロールを「ハイライト小節の要素追跡」に置き換える（スクロールシークは廃止）。

**Architecture:** `usePlaybackState` の tick を「固定加算」から「`performance.now()` 差分加算」へ。`usePlaybackSync` を全面書き換えし、`currentMeasure` を watch（`flush: 'post'`）して `.grid-measure.is-current-measure` を可視域上部30%へ smooth スクロール。`SongDetailPage` は `@scroll` バインディングと `progress` の受け渡しをやめ、`currentMeasure` を渡す。

**Tech Stack:** Vue 3 + Vitest（environment: node — DOM はフェイク要素で表現）。新規依存なし。

**Spec:** `docs/superpowers/specs/2026-07-04-playback-fixes-design.md`

**Branch:** `fix/playback-sync`（main から作成）

## Global Constraints

- `.ts` ファイルはタブインデント・シングルクォート・セミコロンなし。`.vue` は2スペース
- コミット前に必ず `npm run lint` と `npm run test` を実行し、両方成功を確認する
- `usePlaybackState` の公開インターフェース（`PlaybackState`）は変更しない
- `usePlaybackSync` の新オプションは `{ contentRef, isPlaying, currentMeasure, totalDuration, seek }`、返り値は `{ handleSeek }` のみ（`handleScroll` と `progress` は廃止）

---

### Task 1: 再生クロックの実時計化

**Files:**
- Modify: `src/pages/song-detail/composables/usePlaybackState.ts`（`play` / `pause` のみ）
- Modify: `src/pages/song-detail/composables/usePlaybackState.test.ts`

**Interfaces:**
- Consumes/Produces: `PlaybackState` 公開型は不変。挙動変更は「tick 遅延が再生速度に影響しなくなる」のみ

- [ ] **Step 1: テストのタイマー設定を実時計対応にし、検証を追加**

`usePlaybackState.test.ts` の `beforeEach` にあるフェイクタイマー設定を確認し、`vi.useFakeTimers()` を以下に変更（既に `toFake` 指定がある場合は `'performance'` を追加）:

```ts
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date', 'performance'] })
```

describe `usePlaybackState` 内にテストを追加:

```ts
	it('advances by wall-clock elapsed time, not by tick count', () => {
		const playback = usePlaybackState({ tempo: 60, beatsPerMeasure: 4, totalMeasures: 100 })

		playback.play()
		vi.advanceTimersByTime(1000)
		playback.pause()

		// 60BPM 4/4 → 1小節4秒。1秒経過なら currentTime ≒ 1.0（tick 粒度の誤差のみ許容）
		expect(playback.currentTime.value).toBeGreaterThan(0.95)
		expect(playback.currentTime.value).toBeLessThanOrEqual(1.0)
	})

	it('applies speed multiplier to elapsed time', () => {
		const playback = usePlaybackState({ tempo: 60, beatsPerMeasure: 4, totalMeasures: 100 })

		playback.setSpeed(2)
		playback.play()
		vi.advanceTimersByTime(1000)
		playback.pause()

		expect(playback.currentTime.value).toBeGreaterThan(1.9)
		expect(playback.currentTime.value).toBeLessThanOrEqual(2.0)
	})
```

- [ ] **Step 2: テストの現状確認**

Run: `npx vitest run src/pages/song-detail/composables/usePlaybackState.test.ts`
Expected: 追加2件は現実装（固定加算）でも数値上は通る可能性が高い（フェイクタイマーは正確に発火するため）。**両方 PASS でもそのまま進んでよい**（このテストは実装後の回帰網。既存テストが `toFake` 変更で落ちた場合はここで直す）

- [ ] **Step 3: 実装**

`usePlaybackState.ts` の `play` / `pause` を置換（`TICK_MS` 定義と他は不変）:

```ts
	let lastTickAt: number | null = null

	function play() {
		if (playbackInterval) return
		isPlaying.value = true
		lastTickAt = performance.now()

		playbackInterval = setInterval(() => {
			const now = performance.now()
			const elapsedSeconds = lastTickAt === null ? 0 : (now - lastTickAt) / 1000
			lastTickAt = now
			const newTime = currentTime.value + elapsedSeconds * speedMultiplier.value

			// Loop or stop at end
			if (newTime >= totalDuration.value) {
				currentTime.value = 0 // Loop
			} else {
				currentTime.value = newTime
			}
		}, TICK_MS)
	}

	function pause() {
		if (playbackInterval) {
			clearInterval(playbackInterval)
			playbackInterval = null
		}
		lastTickAt = null
		isPlaying.value = false
	}
```

（`let lastTickAt` は `let playbackInterval` の隣に置く）

- [ ] **Step 4: テスト + lint + コミット**

```bash
npx vitest run src/pages/song-detail/composables/usePlaybackState.test.ts
npm run lint && npm run test
git add src/pages/song-detail/composables/usePlaybackState.ts src/pages/song-detail/composables/usePlaybackState.test.ts
git commit -m "Drive playback clock from wall time instead of tick count"
```

---

### Task 2: 要素追跡スクロールへの置き換え

**Files:**
- Modify: `src/pages/song-detail/composables/usePlaybackSync.ts`（全面置換）
- Modify: `src/pages/song-detail/composables/usePlaybackSync.test.ts`（全面置換）
- Modify: `src/pages/SongDetailPage.vue`（配線変更）

**Interfaces:**
- Produces: `usePlaybackSync({ contentRef, isPlaying, currentMeasure, totalDuration, seek })` → `{ handleSeek }`。`computeTargetScrollTop(containerHeight, elementOffsetTop, elementHeight): number` を export（テスト用純関数）
- `handleScroll` は廃止（スクロールシーク廃止 — 仕様書の決定事項）

- [ ] **Step 1: 失敗するテストを書く（テストファイルを全面置換）**

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { usePlaybackSync, computeTargetScrollTop } from './usePlaybackSync'

interface FakeElementOptions {
	top: number
	height: number
}

function createContainer(options: {
	clientHeight: number
	scrollTop: number
	currentElement: FakeElementOptions | null
}) {
	const scrollTo = vi.fn()
	const element = options.currentElement
		? {
			getBoundingClientRect: () => ({ top: options.currentElement!.top, height: options.currentElement!.height })
		}
		: null
	const container = {
		clientHeight: options.clientHeight,
		scrollTop: options.scrollTop,
		scrollTo,
		getBoundingClientRect: () => ({ top: 0, left: 0, width: 100 }),
		querySelector: (selector: string) =>
			selector === '.grid-measure.is-current-measure' ? element : null
	}
	return { container: container as unknown as HTMLElement, scrollTo }
}

describe('computeTargetScrollTop', () => {
	it('anchors the element center at 30% of the viewport', () => {
		// containerHeight 500 → アンカー 150。要素中心 1020 → 870
		expect(computeTargetScrollTop(500, 1000, 40)).toBe(870)
	})

	it('clamps to zero near the top', () => {
		expect(computeTargetScrollTop(500, 100, 40)).toBe(0)
	})
})

describe('usePlaybackSync', () => {
	it('scrolls to the highlighted measure when it changes while playing', async () => {
		const { container, scrollTo } = createContainer({
			clientHeight: 500,
			scrollTop: 200,
			currentElement: { top: 800, height: 40 }
		})
		const contentRef = ref<HTMLElement | null>(container)
		const isPlaying = ref(true)
		const currentMeasure = ref(0)
		const totalDuration = ref(100)
		const seek = vi.fn()

		usePlaybackSync({ contentRef, isPlaying, currentMeasure, totalDuration, seek })

		currentMeasure.value = 1
		await nextTick()

		// 要素のコンテンツ内オフセット = rect.top(800) - コンテナ top(0) + scrollTop(200) = 1000
		expect(scrollTo).toHaveBeenCalledWith({ top: 870, behavior: 'smooth' })
	})

	it('scrolls when playback starts', async () => {
		const { container, scrollTo } = createContainer({
			clientHeight: 500,
			scrollTop: 0,
			currentElement: { top: 800, height: 40 }
		})
		const contentRef = ref<HTMLElement | null>(container)
		const isPlaying = ref(false)
		const currentMeasure = ref(3)
		const totalDuration = ref(100)
		const seek = vi.fn()

		usePlaybackSync({ contentRef, isPlaying, currentMeasure, totalDuration, seek })

		isPlaying.value = true
		await nextTick()

		expect(scrollTo).toHaveBeenCalledTimes(1)
	})

	it('does not scroll while paused', async () => {
		const { container, scrollTo } = createContainer({
			clientHeight: 500,
			scrollTop: 0,
			currentElement: { top: 800, height: 40 }
		})
		const contentRef = ref<HTMLElement | null>(container)
		const isPlaying = ref(false)
		const currentMeasure = ref(0)
		const totalDuration = ref(100)
		const seek = vi.fn()

		usePlaybackSync({ contentRef, isPlaying, currentMeasure, totalDuration, seek })

		currentMeasure.value = 2
		await nextTick()

		expect(scrollTo).not.toHaveBeenCalled()
	})

	it('tolerates a missing highlight element', async () => {
		const { container, scrollTo } = createContainer({
			clientHeight: 500,
			scrollTop: 0,
			currentElement: null
		})
		const contentRef = ref<HTMLElement | null>(container)
		const isPlaying = ref(true)
		const currentMeasure = ref(0)
		const totalDuration = ref(100)
		const seek = vi.fn()

		usePlaybackSync({ contentRef, isPlaying, currentMeasure, totalDuration, seek })

		currentMeasure.value = 1
		await nextTick()

		expect(scrollTo).not.toHaveBeenCalled()
	})

	it('handleSeek seeks proportionally without scrolling', () => {
		const { container, scrollTo } = createContainer({
			clientHeight: 500,
			scrollTop: 0,
			currentElement: { top: 800, height: 40 }
		})
		const contentRef = ref<HTMLElement | null>(container)
		const isPlaying = ref(false)
		const currentMeasure = ref(0)
		const totalDuration = ref(200)
		const seek = vi.fn()

		const { handleSeek } = usePlaybackSync({ contentRef, isPlaying, currentMeasure, totalDuration, seek })

		const event = { currentTarget: container, clientX: 50 } as unknown as MouseEvent
		handleSeek(event)

		expect(seek).toHaveBeenCalledWith(100)
		expect(scrollTo).not.toHaveBeenCalled()
	})
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/pages/song-detail/composables/usePlaybackSync.test.ts`
Expected: FAIL（`computeTargetScrollTop` が存在しない・オプション形が違う）

- [ ] **Step 3: usePlaybackSync.ts を全面置換**

```ts
import { watch, type Ref, type ComputedRef } from 'vue'

export interface UsePlaybackSyncOptions {
	contentRef: Ref<HTMLElement | null>
	isPlaying: Ref<boolean> | ComputedRef<boolean>
	currentMeasure: Ref<number> | ComputedRef<number>
	totalDuration: Ref<number> | ComputedRef<number>
	seek: (time: number) => void
}

// 現在小節の中心を可視域の上から30%に合わせる（ヘッダ・プレイヤーバーからの余白）
const SCROLL_ANCHOR_RATIO = 0.3

export function computeTargetScrollTop(
	containerHeight: number,
	elementOffsetTop: number,
	elementHeight: number
): number {
	return Math.max(elementOffsetTop + elementHeight / 2 - containerHeight * SCROLL_ANCHOR_RATIO, 0)
}

export function usePlaybackSync(options: UsePlaybackSyncOptions) {
	function scrollToCurrentMeasure() {
		const container = options.contentRef.value
		if (!container) return
		const element = container.querySelector('.grid-measure.is-current-measure') as HTMLElement | null
		if (!element) return

		const containerRect = container.getBoundingClientRect()
		const elementRect = element.getBoundingClientRect()
		const elementOffsetTop = elementRect.top - containerRect.top + container.scrollTop
		const target = computeTargetScrollTop(container.clientHeight, elementOffsetTop, elementRect.height)
		container.scrollTo({ top: target, behavior: 'smooth' })
	}

	// flush: 'post' — ハイライトの DOM 反映後に要素を探す
	watch([options.isPlaying, options.currentMeasure], () => {
		if (!options.isPlaying.value) return
		scrollToCurrentMeasure()
	}, { flush: 'post' })

	function handleSeek(event: MouseEvent | TouchEvent) {
		const target = event.currentTarget as HTMLElement
		const rect = target.getBoundingClientRect()
		const clientX = 'touches' in event ? event.touches[0]!.clientX : event.clientX
		const x = clientX - rect.left
		const percentage = Math.max(0, Math.min(1, x / rect.width))
		options.seek(percentage * options.totalDuration.value)
	}

	return {
		handleSeek
	}
}
```

- [ ] **Step 4: SongDetailPage.vue の配線変更**

- `usePlaybackSync` 呼び出しを置換:

```ts
const { handleSeek } = usePlaybackSync({
  contentRef,
  isPlaying,
  currentMeasure,
  totalDuration,
  seek: playback.seek
})
```

（`progress` を渡すのをやめ `currentMeasure` を渡す。`handleScroll` の destructure を削除）

- template の `<main ref="contentRef" class="song-content" @scroll="handleScroll">` から `@scroll="handleScroll"` を削除
- script 内に `progress` を使う他の箇所（シークバーの fill/thumb `:style`）があるが、`progress` は `useSongDetailViewState` から来ているため**そのまま維持**（渡すのをやめるのは usePlaybackSync へのオプションだけ）

- [ ] **Step 5: テスト + ビルド + lint + コミット**

```bash
npx vitest run src/pages/song-detail/composables/usePlaybackSync.test.ts
npm run build && npm run lint && npm run test
git add src/pages/song-detail/composables/usePlaybackSync.ts src/pages/song-detail/composables/usePlaybackSync.test.ts src/pages/SongDetailPage.vue
git commit -m "Track the highlighted measure for playback auto-scroll"
```

---

## 完了条件

- `npm run build && npm run lint && npm run test` がすべて成功
- 実機確認（中和 dev サーバー）:
  - 縦長の曲（歌詞のみセクション混在）を再生 → ハイライト小節が常に可視域内（上から約30%）に追従し、ヘッダ裏に隠れない
  - シークバー・小節行タップでのシーク後、再生中なら該当位置へスクロール
  - 一時停止中に自由にスクロールできる（再生位置が動かない）
  - 再生再開で現在小節へスクロール復帰
  - 再生速度が体感で bpm どおり（60BPM 4/4 なら1小節=4秒をストップウォッチで確認）
