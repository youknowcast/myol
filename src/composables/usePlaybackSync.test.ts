import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { usePlaybackSync } from './usePlaybackSync'

function createScrollableElement(scrollHeight: number, clientHeight: number) {
	const element = {
		scrollHeight,
		clientHeight,
		scrollTop: 0,
		getBoundingClientRect: () => ({ left: 0, width: 100 })
	}
	return element as unknown as HTMLElement
}

describe('usePlaybackSync', () => {
	it('syncs scroll position while playing', async () => {
		const contentRef = ref<HTMLElement | null>(createScrollableElement(1000, 500))
		const isPlaying = ref(true)
		const progress = ref(0)
		const totalDuration = ref(100)
		const seek = vi.fn()

		usePlaybackSync({ contentRef, isPlaying, progress, totalDuration, seek })

		progress.value = 0.5
		await nextTick()

		expect(contentRef.value?.scrollTop).toBe(250)
	})

	it('seeks on user interaction and updates scroll', () => {
		const element = createScrollableElement(1000, 500)
		const contentRef = ref<HTMLElement | null>(element)
		const isPlaying = ref(false)
		const progress = ref(0)
		const totalDuration = ref(200)
		const seek = vi.fn()

		const { handleSeek } = usePlaybackSync({ contentRef, isPlaying, progress, totalDuration, seek })

		const event = { currentTarget: element, clientX: 50 } as unknown as MouseEvent
		handleSeek(event)

		expect(seek).toHaveBeenCalledWith(100)
		expect(element.scrollTop).toBe(250)
	})

	it('updates playback on manual scroll', () => {
		const element = createScrollableElement(1000, 500)
		const contentRef = ref<HTMLElement | null>(element)
		const isPlaying = ref(false)
		const progress = ref(0)
		const totalDuration = ref(120)
		const seek = vi.fn()

		const { handleScroll } = usePlaybackSync({ contentRef, isPlaying, progress, totalDuration, seek })

		element.scrollTop = 125
		handleScroll()

		expect(seek).toHaveBeenCalledWith(30)
	})

	it('ignores scroll when playing', () => {
		const element = createScrollableElement(1000, 500)
		const contentRef = ref<HTMLElement | null>(element)
		const isPlaying = ref(true)
		const progress = ref(0)
		const totalDuration = ref(120)
		const seek = vi.fn()

		const { handleScroll } = usePlaybackSync({ contentRef, isPlaying, progress, totalDuration, seek })

		element.scrollTop = 200
		handleScroll()

		expect(seek).not.toHaveBeenCalled()
	})
})
