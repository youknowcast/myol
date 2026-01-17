import { computed, ref } from 'vue'
import type { PlaybackState } from './usePlaybackState'

export type ViewMode = 'lyrics' | 'grid'

export interface UseSongDetailViewStateOptions {
	playback: PlaybackState
}

export function useSongDetailViewState(options: UseSongDetailViewStateOptions) {
	const viewMode = ref<ViewMode>('lyrics')

	const isPlaying = options.playback.isPlaying
	const currentTime = options.playback.currentTime
	const currentMeasure = options.playback.currentMeasure
	const progress = options.playback.progress
	const totalDuration = options.playback.totalDuration
	const speedMultiplier = options.playback.speedMultiplier

	function togglePlay() {
		options.playback.togglePlay()
	}

	function handleSpeedChange(speed: number) {
		options.playback.setSpeed(speed)
	}

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60)
		const secs = Math.floor(seconds % 60)
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}

	const formattedCurrentTime = computed(() => formatTime(currentTime.value))
	const formattedTotalDuration = computed(() => formatTime(totalDuration.value))

	return {
		viewMode,
		isPlaying,
		currentTime,
		currentMeasure,
		progress,
		totalDuration,
		speedMultiplier,
		formattedCurrentTime,
		formattedTotalDuration,
		togglePlay,
		handleSpeedChange
	}
}
