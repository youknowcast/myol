# メトロノーム機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 再生中に拍へ合わせてクリック音を鳴らすメトロノーム（1拍目アクセント、プレーヤーバーのトグル、初期OFF）を追加する。

**Architecture:** 純粋な拍列挙ロジックを `src/lib/metronome/scheduler.ts` に置き、`useMetronome` composable が Web Audio の先読みスケジューラ（25ms ループで 100ms 先の拍を oscillator として予約）として消費する。UI はプレーヤーバーにトグルボタンを 1 個追加するだけ。

**Tech Stack:** Vue 3 (script setup) / TypeScript / Web Audio API（依存追加なし）/ Vitest

**Spec:** `docs/superpowers/specs/2026-07-07-metronome-design.md`

## Global Constraints

- ブランチ: `feature/metronome`（作成済み）
- commit 前に必ず `npm run lint` と `npm test` を実行する（`~/ai-dev-rules/typescript.md`）
- 音源ファイルは追加しない。クリック音は oscillator で合成する
- 拍子は曲全体で一定という現行再生モデルに合わせる（小節ごとの拍数変更はスコープ外）
- 音量は固定。音量スライダー・カウントインは作らない
- `src/lib/` 配下はタブインデント、`.vue` は 2 スペース（既存ファイルに合わせる）
- コミットメッセージは既存に合わせた英語命令形（例: `Add measure beat layout rules as a pure lib function`）

---

### Task 1: 拍スケジューリングの純粋ロジック `scheduler.ts`

**Files:**
- Create: `src/lib/metronome/scheduler.ts`
- Test: `src/lib/metronome/scheduler.test.ts`

**Interfaces:**
- Consumes: なし（依存ゼロの純関数）
- Produces:
  - `interface ScheduledBeat { beatIndex: number; songTime: number; accent: boolean }`
  - `function isAccent(beatIndex: number, beatsPerMeasure: number): boolean`
  - `function upcomingBeats(options: { songTimeNow: number; windowSeconds: number; secondsPerBeat: number; beatsPerMeasure: number; lastScheduledBeatIndex: number | null }): ScheduledBeat[]`

`upcomingBeats` は「曲時刻 `songTimeNow` から先読み窓 `windowSeconds` 内にあり、まだ予約していない拍」を列挙する。`lastScheduledBeatIndex` 以下の拍番号は除外（二重予約防止）。前方 seek は `max(現在時刻由来の拍, last+1)` で自然に追従する。巻き戻り時のリセットは呼び出し側（Task 2）の責務。

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/metronome/scheduler.test.ts` を作成:

```ts
import { describe, it, expect } from 'vitest'
import { isAccent, upcomingBeats } from './scheduler'

describe('isAccent', () => {
	it('marks the first beat of each measure', () => {
		expect(isAccent(0, 4)).toBe(true)
		expect(isAccent(1, 4)).toBe(false)
		expect(isAccent(3, 4)).toBe(false)
		expect(isAccent(4, 4)).toBe(true)
		expect(isAccent(6, 3)).toBe(true)
	})

	it('returns false for invalid beatsPerMeasure', () => {
		expect(isAccent(0, 0)).toBe(false)
	})
})

describe('upcomingBeats', () => {
	const base = {
		windowSeconds: 0.1,
		secondsPerBeat: 0.5,
		beatsPerMeasure: 4,
		lastScheduledBeatIndex: null
	}

	it('includes a beat exactly at the current time', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 0 })).toEqual([
			{ beatIndex: 0, songTime: 0, accent: true }
		])
	})

	it('excludes already scheduled beats', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 0, lastScheduledBeatIndex: 0 })).toEqual([])
	})

	it('lists every beat inside the lookahead window', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 0.45, windowSeconds: 0.6 })).toEqual([
			{ beatIndex: 1, songTime: 0.5, accent: false },
			{ beatIndex: 2, songTime: 1, accent: false }
		])
	})

	it('skips ahead after a forward seek', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 10, lastScheduledBeatIndex: 3 })).toEqual([
			{ beatIndex: 20, songTime: 10, accent: true }
		])
	})

	it('returns empty for non-positive secondsPerBeat', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 0, secondsPerBeat: 0 })).toEqual([])
	})
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/lib/metronome/scheduler.test.ts`
Expected: FAIL（`scheduler.ts` が存在しないため import エラー）

- [ ] **Step 3: 最小実装を書く**

`src/lib/metronome/scheduler.ts` を作成:

```ts
/**
 * メトロノームの拍スケジューリング規則（docs/superpowers/specs/2026-07-07-metronome-design.md）
 * - 先読み窓内の未予約の拍を列挙する
 * - 巻き戻り（ループ・後方 seek）時の lastScheduledBeatIndex リセットは呼び出し側の責務
 */
export interface ScheduledBeat {
	beatIndex: number
	songTime: number
	accent: boolean
}

export interface UpcomingBeatsOptions {
	songTimeNow: number
	windowSeconds: number
	secondsPerBeat: number
	beatsPerMeasure: number
	lastScheduledBeatIndex: number | null
}

const EPSILON = 1e-9

export function isAccent(beatIndex: number, beatsPerMeasure: number): boolean {
	if (beatsPerMeasure <= 0) return false
	return beatIndex % beatsPerMeasure === 0
}

export function upcomingBeats(options: UpcomingBeatsOptions): ScheduledBeat[] {
	const { songTimeNow, windowSeconds, secondsPerBeat, beatsPerMeasure, lastScheduledBeatIndex } = options
	if (secondsPerBeat <= 0 || windowSeconds <= 0) return []

	const firstFromTime = Math.ceil(songTimeNow / secondsPerBeat - EPSILON)
	const firstAfterScheduled = lastScheduledBeatIndex === null ? 0 : lastScheduledBeatIndex + 1
	const firstIndex = Math.max(firstFromTime, firstAfterScheduled, 0)
	const windowEnd = songTimeNow + windowSeconds

	const beats: ScheduledBeat[] = []
	for (let index = firstIndex; index * secondsPerBeat < windowEnd - EPSILON; index++) {
		beats.push({
			beatIndex: index,
			songTime: index * secondsPerBeat,
			accent: isAccent(index, beatsPerMeasure)
		})
	}
	return beats
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/lib/metronome/scheduler.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: lint と全テストを実行してコミット**

```bash
npm run lint && npm test
git add src/lib/metronome/scheduler.ts src/lib/metronome/scheduler.test.ts
git commit -m "Add metronome beat scheduling as a pure lib function"
```

---

### Task 2: Web Audio 層 `useMetronome` composable

**Files:**
- Create: `src/pages/song-detail/composables/useMetronome.ts`

**Interfaces:**
- Consumes: Task 1 の `upcomingBeats` / `ScheduledBeat`
- Produces:
  - `interface UseMetronomeOptions { isPlaying: Ref<boolean> | ComputedRef<boolean>; currentTime: Ref<number>; tempo: Ref<number>; beatsPerMeasure: Ref<number>; speedMultiplier: Ref<number> }`
  - `function useMetronome(options: UseMetronomeOptions): { enabled: Ref<boolean>; toggle: () => void; dispose: () => void }`

方針: AudioContext 依存部分は薄く保ち、ユニットテストは Task 1 の純関数のみ（spec のテスト方針どおり）。動作確認は Task 4 の実機検証で行う。

- [ ] **Step 1: composable を実装する**

`src/pages/song-detail/composables/useMetronome.ts` を作成:

```ts
/**
 * Metronome Composable
 * Web Audio の先読みスケジューラで拍に合わせてクリック音を鳴らす
 * (docs/superpowers/specs/2026-07-07-metronome-design.md)
 */

import { ref, watch, type Ref, type ComputedRef } from 'vue'
import { upcomingBeats } from '@/lib/metronome/scheduler'

export interface UseMetronomeOptions {
	isPlaying: Ref<boolean> | ComputedRef<boolean>
	currentTime: Ref<number>
	tempo: Ref<number>
	beatsPerMeasure: Ref<number>
	speedMultiplier: Ref<number>
}

const SCHEDULER_INTERVAL_MS = 25
const LOOKAHEAD_SECONDS = 0.1
const CLICK_DURATION_SECONDS = 0.03
const ACCENT_FREQUENCY_HZ = 1760
const NORMAL_FREQUENCY_HZ = 880
const CLICK_GAIN = 0.3

export function useMetronome(options: UseMetronomeOptions) {
	const enabled = ref(false)

	let audioContext: AudioContext | null = null
	let schedulerInterval: ReturnType<typeof setInterval> | null = null
	let lastScheduledBeatIndex: number | null = null
	let lastSongTime = 0
	let activeOscillators: OscillatorNode[] = []

	function toggle() {
		enabled.value = !enabled.value
		if (enabled.value) {
			// ユーザー操作時に生成・resume（ブラウザの自動再生制限対策）
			if (!audioContext) {
				audioContext = new AudioContext()
			}
			void audioContext.resume()
		}
	}

	function scheduleClick(audioTime: number, accent: boolean) {
		if (!audioContext) return
		const oscillator = audioContext.createOscillator()
		const gain = audioContext.createGain()
		oscillator.frequency.value = accent ? ACCENT_FREQUENCY_HZ : NORMAL_FREQUENCY_HZ
		gain.gain.setValueAtTime(CLICK_GAIN, audioTime)
		gain.gain.exponentialRampToValueAtTime(0.001, audioTime + CLICK_DURATION_SECONDS)
		oscillator.connect(gain).connect(audioContext.destination)
		oscillator.start(audioTime)
		oscillator.stop(audioTime + CLICK_DURATION_SECONDS)
		activeOscillators.push(oscillator)
		oscillator.onended = () => {
			activeOscillators = activeOscillators.filter(node => node !== oscillator)
		}
	}

	function schedulerTick() {
		if (!audioContext) return
		const songTimeNow = options.currentTime.value

		// ループ・後方 seek で曲時刻が巻き戻ったら予約記録をリセット
		if (songTimeNow < lastSongTime) {
			lastScheduledBeatIndex = null
		}
		lastSongTime = songTimeNow

		const speed = options.speedMultiplier.value
		const beats = upcomingBeats({
			songTimeNow,
			windowSeconds: LOOKAHEAD_SECONDS * speed,
			secondsPerBeat: 60 / options.tempo.value,
			beatsPerMeasure: options.beatsPerMeasure.value,
			lastScheduledBeatIndex
		})
		for (const beat of beats) {
			const audioTime = audioContext.currentTime + (beat.songTime - songTimeNow) / speed
			scheduleClick(Math.max(audioTime, audioContext.currentTime), beat.accent)
			lastScheduledBeatIndex = beat.beatIndex
		}
	}

	function startScheduler() {
		if (schedulerInterval) return
		lastScheduledBeatIndex = null
		lastSongTime = options.currentTime.value
		schedulerTick()
		schedulerInterval = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS)
	}

	function stopScheduler() {
		if (schedulerInterval) {
			clearInterval(schedulerInterval)
			schedulerInterval = null
		}
		for (const oscillator of activeOscillators) {
			try {
				oscillator.stop()
			} catch {
				// 既に停止済みのノードは無視
			}
		}
		activeOscillators = []
		lastScheduledBeatIndex = null
	}

	watch([enabled, options.isPlaying], ([isEnabled, isPlaying]) => {
		if (isEnabled && isPlaying) {
			startScheduler()
		} else {
			stopScheduler()
		}
	})

	function dispose() {
		stopScheduler()
		if (audioContext) {
			void audioContext.close()
			audioContext = null
		}
	}

	return {
		enabled,
		toggle,
		dispose
	}
}
```

- [ ] **Step 2: 型チェック・lint・全テストを実行**

Run: `npm run build && npm run lint && npm test`
Expected: すべて成功（build は `vue-tsc -b` を含むため型エラーがあればここで出る）

- [ ] **Step 3: コミット**

```bash
git add src/pages/song-detail/composables/useMetronome.ts
git commit -m "Add metronome composable with Web Audio lookahead scheduling"
```

---

### Task 3: トグル UI とページ結線

**Files:**
- Create: `src/components/player/MetronomeToggle.vue`
- Modify: `src/pages/SongDetailPage.vue`（import 群、composable 結線、`onUnmounted`、`<footer class="player-bar">` 内のコントロール行、style）

**Interfaces:**
- Consumes: Task 2 の `useMetronome`
- Produces: `MetronomeToggle.vue` — props `{ enabled: boolean }`、emit `(e: 'toggle'): void`

- [ ] **Step 1: MetronomeToggle コンポーネントを作成**

`src/components/player/MetronomeToggle.vue` を作成:

```vue
<script setup lang="ts">
interface Props {
  enabled: boolean
}

interface Emits {
  (e: 'toggle'): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<template>
  <button
    class="metronome-btn"
    :class="{ active: enabled }"
    :aria-pressed="enabled"
    aria-label="メトロノーム"
    @click="$emit('toggle')"
  >
    ♩
  </button>
</template>

<style scoped>
.metronome-btn {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.metronome-btn:hover {
  color: var(--color-text);
}

.metronome-btn.active {
  background: var(--color-primary);
  color: white;
}
</style>
```

- [ ] **Step 2: SongDetailPage に結線**

`src/pages/SongDetailPage.vue` を修正。

import 群（`SpeedControl` の import の下）に追加:

```ts
import { useMetronome } from '@/pages/song-detail/composables/useMetronome'
import MetronomeToggle from '@/components/player/MetronomeToggle.vue'
```

`useSongDetailViewState` の分割代入の後（`// Sync config from parsed song` の前）に追加:

```ts
const metronome = useMetronome({
  isPlaying,
  currentTime: playback.currentTime,
  tempo: playback.tempo,
  beatsPerMeasure: playback.beatsPerMeasure,
  speedMultiplier
})
```

`onUnmounted` を修正:

```ts
onUnmounted(() => {
  playback.dispose()
  metronome.dispose()
})
```

テンプレートの `<SpeedControl ... />`（`</footer>` 直前）を `.player-controls` で包み、トグルを追加:

```html
        <div class="player-controls">
          <SpeedControl
            :speed="speedMultiplier"
            :is-playing="isPlaying"
            @update:speed="handleSpeedChange"
            @toggle-play="togglePlay"
          />
          <MetronomeToggle
            :enabled="metronome.enabled.value"
            @toggle="metronome.toggle()"
          />
        </div>
```

`<style scoped>` の `.measure-total` の後に追加:

```css
.player-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
}
```

- [ ] **Step 3: 型チェック・lint・全テストを実行**

Run: `npm run build && npm run lint && npm test`
Expected: すべて成功

- [ ] **Step 4: コミット**

```bash
git add src/components/player/MetronomeToggle.vue src/pages/SongDetailPage.vue
git commit -m "Add metronome toggle to the player bar"
```

---

### Task 4: 実機検証（コミットなし）

**Files:** なし（検証のみ）

- [ ] **Step 1: dev サーバーで曲詳細を開く**

`npm run dev` を起動し、Chromium で任意の曲の詳細ページを開く（検証環境のセットアップはメモリ「実機検証セットアップ」参照。認証バイパスあり）。

- [ ] **Step 2: 動作確認チェックリスト**

以下を確認する（音は CDP では聞けないため、可能なら実際に耳で確認。CDP 検証時は `AudioContext.state` と oscillator 予約の console 確認で代替）:

1. トグル OFF のまま再生 → クリック音が鳴らない
2. トグル ON → 再生 → テンポどおり「ピッ（1拍目・高）/ポッ（2拍目以降・低）」が鳴る
3. 再生中に速度を 0.5x / 2x に変更 → クリック間隔が追従する
4. シークバーで前後にジャンプ → クリックが二重に鳴ったり止まったりしない
5. 曲末ループで巻き戻り → 継続してクリックが鳴る
6. 一時停止 → クリックが止まる。再開 → 再び鳴る
7. トグル OFF → 即座に止まる

- [ ] **Step 3: 問題があれば修正して再検証**

不具合があれば superpowers:systematic-debugging に従って修正し、該当タスクの検証（lint / test）とコミットをやり直す。
