import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
	usePlaybackState,
	calculateSecondsPerMeasure,
	calculateCurrentMeasure
} from './usePlaybackState'

describe('calculateSecondsPerMeasure', () => {
	it('calculates correctly for 120 BPM, 4/4', () => {
		// 120 BPM = 2 beats per second
		// 4 beats per measure = 2 seconds per measure
		expect(calculateSecondsPerMeasure(120, 4)).toBe(2)
	})

	it('calculates correctly for 60 BPM, 4/4', () => {
		// 60 BPM = 1 beat per second
		// 4 beats per measure = 4 seconds per measure
		expect(calculateSecondsPerMeasure(60, 4)).toBe(4)
	})

	it('calculates correctly for 90 BPM, 3/4', () => {
		// 90 BPM = 1.5 beats per second
		// 3 beats per measure = 2 seconds per measure
		expect(calculateSecondsPerMeasure(90, 3)).toBe(2)
	})

	it('handles zero tempo', () => {
		expect(calculateSecondsPerMeasure(0, 4)).toBe(1)
	})
})

describe('calculateCurrentMeasure', () => {
	it('returns 0 for time 0', () => {
		expect(calculateCurrentMeasure(0, 2)).toBe(0)
	})

	it('returns correct measure for time within first measure', () => {
		expect(calculateCurrentMeasure(1, 2)).toBe(0)
	})

	it('returns correct measure for time at measure boundary', () => {
		expect(calculateCurrentMeasure(2, 2)).toBe(1)
	})

	it('returns correct measure for time mid-measure', () => {
		expect(calculateCurrentMeasure(5.5, 2)).toBe(2)
	})

	it('handles zero secondsPerMeasure', () => {
		expect(calculateCurrentMeasure(5, 0)).toBe(0)
	})
})

describe('usePlaybackState', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('initializes with default values', () => {
		const state = usePlaybackState()

		expect(state.isPlaying.value).toBe(false)
		expect(state.currentTime.value).toBe(0)
		expect(state.tempo.value).toBe(80)
		expect(state.beatsPerMeasure.value).toBe(4)
		expect(state.currentMeasure.value).toBe(0)

		state.dispose()
	})

	it('initializes with custom config', () => {
		const state = usePlaybackState({
			tempo: 120,
			beatsPerMeasure: 3,
			totalMeasures: 16
		})

		expect(state.tempo.value).toBe(120)
		expect(state.beatsPerMeasure.value).toBe(3)
		expect(state.totalMeasures.value).toBe(16)

		state.dispose()
	})

	it('togglePlay starts and stops playback', () => {
		const state = usePlaybackState()

		expect(state.isPlaying.value).toBe(false)
		state.togglePlay()
		expect(state.isPlaying.value).toBe(true)
		state.togglePlay()
		expect(state.isPlaying.value).toBe(false)

		state.dispose()
	})

	it('seek updates currentTime', () => {
		const state = usePlaybackState({ totalMeasures: 10 })

		state.seek(5)
		expect(state.currentTime.value).toBe(5)

		state.dispose()
	})

	it('seekToMeasure updates currentTime to measure start', () => {
		const state = usePlaybackState({
			tempo: 60,    // 1 beat per second
			beatsPerMeasure: 4,  // 4 seconds per measure
			totalMeasures: 10
		})

		state.seekToMeasure(2)
		expect(state.currentTime.value).toBe(8) // 2 * 4 seconds
		expect(state.currentMeasure.value).toBe(2)

		state.dispose()
	})

	it('currentMeasure updates as time progresses', () => {
		const state = usePlaybackState({
			tempo: 60,
			beatsPerMeasure: 4,
			totalMeasures: 10
		})

		expect(state.currentMeasure.value).toBe(0)

		state.seek(4)  // 4 seconds = 1 full measure
		expect(state.currentMeasure.value).toBe(1)

		state.seek(7)  // 7 seconds = 1.75 measures
		expect(state.currentMeasure.value).toBe(1)

		state.seek(8)  // 8 seconds = 2 full measures
		expect(state.currentMeasure.value).toBe(2)

		state.dispose()
	})

	it('progress is calculated correctly', () => {
		const state = usePlaybackState({
			tempo: 60,
			beatsPerMeasure: 4,
			totalMeasures: 10
		})
		// Total duration = 10 * 4 = 40 seconds

		expect(state.progress.value).toBe(0)

		state.seek(20)  // Half way
		expect(state.progress.value).toBe(0.5)

		state.seek(40)  // End
		expect(state.progress.value).toBe(1)

		state.dispose()
	})

	it('setSpeed clamps to valid range', () => {
		const state = usePlaybackState()

		state.setSpeed(0.1)
		expect(state.speedMultiplier.value).toBe(0.25)

		state.setSpeed(10)
		expect(state.speedMultiplier.value).toBe(4)

		state.setSpeed(1.5)
		expect(state.speedMultiplier.value).toBe(1.5)

		state.dispose()
	})

	it('stop resets time to 0', () => {
		const state = usePlaybackState({ totalMeasures: 10 })

		state.seek(5)
		state.play()
		expect(state.isPlaying.value).toBe(true)

		state.stop()
		expect(state.isPlaying.value).toBe(false)
		expect(state.currentTime.value).toBe(0)

		state.dispose()
	})
})
