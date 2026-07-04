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
