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
