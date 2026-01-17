import { watch, type Ref } from 'vue'

export interface UsePlaybackSyncOptions {
	contentRef: Ref<HTMLElement | null>
	isPlaying: Ref<boolean>
	progress: Ref<number>
	totalDuration: Ref<number>
	seek: (time: number) => void
}

function getMaxScroll(element: HTMLElement): number {
	return Math.max(element.scrollHeight - element.clientHeight, 0)
}

export function usePlaybackSync(options: UsePlaybackSyncOptions) {
	watch([options.isPlaying, options.progress], () => {
		if (!options.isPlaying.value || !options.contentRef.value) return
		const scrollable = options.contentRef.value
		const maxScroll = getMaxScroll(scrollable)
		if (maxScroll > 0) {
			scrollable.scrollTop = options.progress.value * maxScroll
		}
	})

	function handleSeek(event: MouseEvent | TouchEvent) {
		const target = event.currentTarget as HTMLElement
		const rect = target.getBoundingClientRect()
		const clientX = 'touches' in event ? event.touches[0]!.clientX : event.clientX
		const x = clientX - rect.left
		const percentage = Math.max(0, Math.min(1, x / rect.width))

		options.seek(percentage * options.totalDuration.value)

		if (options.contentRef.value) {
			const scrollable = options.contentRef.value
			const maxScroll = getMaxScroll(scrollable)
			scrollable.scrollTop = percentage * maxScroll
		}
	}

	function handleScroll() {
		if (!options.contentRef.value || options.isPlaying.value) return
		const scrollable = options.contentRef.value
		const maxScroll = getMaxScroll(scrollable)
		if (maxScroll > 0) {
			const scrollProgress = scrollable.scrollTop / maxScroll
			options.seek(scrollProgress * options.totalDuration.value)
		}
	}

	return {
		handleSeek,
		handleScroll
	}
}
