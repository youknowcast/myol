import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useLyricsHighlight } from './useLyricsHighlight'

describe('useLyricsHighlight', () => {
	it('maps measures to line index', () => {
		const currentMeasure = ref(2)
		const measureOffset = ref(0)
		const isPlaying = ref(false)
		const linesCount = computed(() => 4)

		const { currentLineIndex } = useLyricsHighlight({
			linesCount,
			currentMeasure,
			measureOffset,
			isPlaying
		})

		expect(currentLineIndex.value).toBe(2)
	})

	it('returns -1 when before section', () => {
		const currentMeasure = ref(0)
		const measureOffset = ref(2)
		const isPlaying = ref(false)
		const linesCount = computed(() => 3)

		const { currentLineIndex } = useLyricsHighlight({
			linesCount,
			currentMeasure,
			measureOffset,
			isPlaying
		})

		expect(currentLineIndex.value).toBe(-1)
	})

	it('centers content while playing', () => {
		const currentMeasure = ref(1)
		const measureOffset = ref(0)
		const isPlaying = ref(true)
		const linesCount = computed(() => 3)

		const { contentTransform } = useLyricsHighlight({
			linesCount,
			currentMeasure,
			measureOffset,
			isPlaying,
			rowHeight: 50
		})

		expect(contentTransform.value).toBe('translateY(25px)')
	})
})
