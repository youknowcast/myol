/**
 * Playback State Composable
 * Centralized management of playback timing and measure tracking
 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

export interface PlaybackConfig {
	tempo: number          // BPM
	beatsPerMeasure: number
	noteValue: number
	totalMeasures: number
}

export interface PlaybackState {
	// Reactive state
	isPlaying: Ref<boolean>
	currentTime: Ref<number>         // in seconds
	speedMultiplier: Ref<number>

	// Computed values
	currentMeasure: ComputedRef<number>
	progress: ComputedRef<number>
	secondsPerMeasure: ComputedRef<number>
	totalDuration: ComputedRef<number>

	// Configuration (reactive)
	tempo: Ref<number>
	beatsPerMeasure: Ref<number>
	totalMeasures: Ref<number>

	// Actions
	play: () => void
	pause: () => void
	togglePlay: () => void
	stop: () => void
	seek: (time: number) => void
	seekToMeasure: (measureIndex: number) => void
	setSpeed: (multiplier: number) => void

	// Cleanup
	dispose: () => void
}

/**
 * Calculate seconds per measure from tempo and time signature
 */
export function calculateSecondsPerMeasure(tempo: number, beatsPerMeasure: number): number {
	if (tempo <= 0) return 1
	return (60 / tempo) * beatsPerMeasure
}

/**
 * Calculate current measure from time
 */
export function calculateCurrentMeasure(currentTime: number, secondsPerMeasure: number): number {
	if (secondsPerMeasure <= 0) return 0
	return Math.floor(currentTime / secondsPerMeasure)
}

/**
 * Create a playback state manager
 */
export function usePlaybackState(initialConfig?: Partial<PlaybackConfig>): PlaybackState {
	// Configuration
	const tempo = ref(initialConfig?.tempo ?? 80)
	const beatsPerMeasure = ref(initialConfig?.beatsPerMeasure ?? 4)
	const totalMeasures = ref(initialConfig?.totalMeasures ?? 1)

	// State
	const isPlaying = ref(false)
	const currentTime = ref(0)
	const speedMultiplier = ref(1)

	// Playback interval
	let playbackInterval: ReturnType<typeof setInterval> | null = null
	const TICK_MS = 16 // ~60fps

	// Computed values
	const secondsPerMeasure = computed(() =>
		calculateSecondsPerMeasure(tempo.value, beatsPerMeasure.value)
	)

	const totalDuration = computed(() =>
		totalMeasures.value * secondsPerMeasure.value
	)

	const currentMeasure = computed(() =>
		calculateCurrentMeasure(currentTime.value, secondsPerMeasure.value)
	)

	const progress = computed(() => {
		if (totalDuration.value <= 0) return 0
		return Math.min(currentTime.value / totalDuration.value, 1)
	})

	// Actions
	function play() {
		if (playbackInterval) return
		isPlaying.value = true

		playbackInterval = setInterval(() => {
			const increment = (TICK_MS / 1000) * speedMultiplier.value
			const newTime = currentTime.value + increment

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
		isPlaying.value = false
	}

	function togglePlay() {
		if (isPlaying.value) {
			pause()
		} else {
			play()
		}
	}

	function stop() {
		pause()
		currentTime.value = 0
	}

	function seek(time: number) {
		currentTime.value = Math.max(0, Math.min(time, totalDuration.value))
	}

	function seekToMeasure(measureIndex: number) {
		const clampedIndex = Math.max(0, Math.min(measureIndex, totalMeasures.value - 1))
		currentTime.value = clampedIndex * secondsPerMeasure.value
	}

	function setSpeed(multiplier: number) {
		speedMultiplier.value = Math.max(0.25, Math.min(multiplier, 4))
	}

	function dispose() {
		pause()
	}

	// Watch for config changes that might affect playback
	watch([tempo, beatsPerMeasure, totalMeasures], () => {
		// Clamp current time to new duration
		if (currentTime.value > totalDuration.value) {
			currentTime.value = 0
		}
	})

	return {
		// State
		isPlaying,
		currentTime,
		speedMultiplier,

		// Computed
		currentMeasure,
		progress,
		secondsPerMeasure,
		totalDuration,

		// Config
		tempo,
		beatsPerMeasure,
		totalMeasures,

		// Actions
		play,
		pause,
		togglePlay,
		stop,
		seek,
		seekToMeasure,
		setSpeed,
		dispose
	}
}
