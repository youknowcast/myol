import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useSongDetailViewState } from './useSongDetailViewState'

const createPlayback = () => {
	const isPlaying = ref(false)
	const currentTime = ref(65)
	const speedMultiplier = ref(1)
	const tempo = ref(100)
	const beatsPerMeasure = ref(4)
	const totalMeasures = ref(10)
	const currentMeasure = computed(() => 2)
	const progress = computed(() => 0.5)
	const secondsPerMeasure = computed(() => 2)
	const totalDuration = computed(() => 120)

	return {
		isPlaying,
		currentTime,
		speedMultiplier,
		tempo,
		beatsPerMeasure,
		totalMeasures,
		currentMeasure,
		progress,
		secondsPerMeasure,
		totalDuration,
		play: () => undefined,
		pause: () => undefined,
		togglePlay: () => undefined,
		stop: () => undefined,
		seek: () => undefined,
		seekToMeasure: () => undefined,
		setSpeed: () => undefined,
		dispose: () => undefined
	}
}

describe('useSongDetailViewState', () => {
	it('formats times for display', () => {
		const playback = createPlayback()
		const { formattedCurrentTime, formattedTotalDuration } = useSongDetailViewState({ playback })

		expect(formattedCurrentTime.value).toBe('1:05')
		expect(formattedTotalDuration.value).toBe('2:00')
	})

	it('toggles playback via handler', () => {
		let toggled = false
		const playback = createPlayback()
		playback.togglePlay = () => {
			toggled = true
		}

		const { togglePlay } = useSongDetailViewState({ playback })
		togglePlay()

		expect(toggled).toBe(true)
	})
})
