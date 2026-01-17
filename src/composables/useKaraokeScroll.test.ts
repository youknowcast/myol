import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useKaraokeScroll } from './useKaraokeScroll'
import type { KaraokeRow } from './useChordProDocument'

describe('useKaraokeScroll', () => {
	const rows = computed<KaraokeRow[]>(() => [
		{ type: 'grid', sectionIndex: 0, rowIndex: 0, startMeasure: 0, endMeasure: 1, content: null },
		{ type: 'grid', sectionIndex: 0, rowIndex: 1, startMeasure: 2, endMeasure: 3, content: null }
	])

	it('finds active row for current measure', () => {
		const currentMeasure = ref(2)
		const isPlaying = ref(false)
		const { activeRowIndex } = useKaraokeScroll({ rows, currentMeasure, isPlaying })

		expect(activeRowIndex.value).toBe(1)
	})

	it('returns transform when playing', () => {
		const currentMeasure = ref(0)
		const isPlaying = ref(true)
		const { contentTransform } = useKaraokeScroll({
			rows,
			currentMeasure,
			isPlaying,
			rowHeight: 100,
			containerHeight: 400
		})

		expect(contentTransform.value).toBe('translateY(140px)')
	})

	it('stays at zero when not playing', () => {
		const currentMeasure = ref(1)
		const isPlaying = ref(false)
		const { contentTransform } = useKaraokeScroll({ rows, currentMeasure, isPlaying })

		expect(contentTransform.value).toBe('translateY(0)')
	})
})
