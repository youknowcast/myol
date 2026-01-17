import { computed, type ComputedRef, type Ref } from 'vue'

export interface UseLyricsHighlightOptions {
	linesCount: ComputedRef<number>
	currentMeasure: Ref<number>
	measureOffset: Ref<number>
	isPlaying: Ref<boolean>
	rowHeight?: number
}

export function useLyricsHighlight(options: UseLyricsHighlightOptions) {
	const rowHeight = options.rowHeight ?? 60

	const currentLineIndex = computed(() => {
		if (options.linesCount.value === 0) return -1
		const localMeasure = options.currentMeasure.value - options.measureOffset.value
		if (localMeasure < 0) return -1
		return localMeasure % options.linesCount.value
	})

	const contentTransform = computed(() => {
		if (!options.isPlaying.value || currentLineIndex.value === -1) return 'translateY(0)'
		const centerOffset = rowHeight * 1.5
		const translateY = -(currentLineIndex.value * rowHeight) + centerOffset
		return `translateY(${translateY}px)`
	})

	return {
		currentLineIndex,
		contentTransform
	}
}
