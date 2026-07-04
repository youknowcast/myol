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
