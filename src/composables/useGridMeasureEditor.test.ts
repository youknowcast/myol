import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useGridMeasureEditor } from './useGridMeasureEditor'
import type { Measure } from '@/lib/chordpro/types'

describe('useGridMeasureEditor', () => {
	const baseMeasures: Measure[] = [
		{ cells: [{ type: 'chord', value: 'C' }] },
		{ cells: [{ type: 'chord', value: 'G' }] }
	]

	it('adds a measure at the end', () => {
		const selectedMeasureIndex = ref<number | null>(null)
		const measures = computed(() => baseMeasures)
		const { addMeasure } = useGridMeasureEditor({ measures, selectedMeasureIndex })

		const next = addMeasure('end')
		expect(next.length).toBe(3)
	})

	it('copies the selected measure', () => {
		const selectedMeasureIndex = ref<number | null>(0)
		const measures = computed(() => baseMeasures)
		const { copyMeasure } = useGridMeasureEditor({ measures, selectedMeasureIndex })

		const next = copyMeasure()
		expect(next[1]?.cells[0]?.value).toBe('C')
	})

	it('deletes a measure without lyrics', () => {
		const selectedMeasureIndex = ref<number | null>(1)
		const measures = computed(() => baseMeasures)
		const { deleteMeasure } = useGridMeasureEditor({ measures, selectedMeasureIndex })

		const next = deleteMeasure()
		expect(next.length).toBe(1)
	})

	it('does not delete measure with lyrics', () => {
		const selectedMeasureIndex = ref<number | null>(0)
		const measures = computed<Measure[]>(() => [
			{ cells: [{ type: 'chord', value: 'C' }], lyricsHint: 'Keep' }
		])
		const { deleteMeasure } = useGridMeasureEditor({ measures, selectedMeasureIndex })

		const next = deleteMeasure()
		expect(next.length).toBe(1)
	})

	it('reorders cells within a measure', () => {
		const selectedMeasureIndex = ref<number | null>(0)
		const measures = computed<Measure[]>(() => [
			{ cells: [{ type: 'chord', value: 'C' }, { type: 'chord', value: 'G' }] }
		])
		const { displayMeasures, reorderCells } = useGridMeasureEditor({ measures, selectedMeasureIndex })

		const ids = displayMeasures.value[0]?.cells.map(cell => cell.id) ?? []
		const next = reorderCells(0, ids.slice().reverse())

		expect(next[0]?.cells[0]?.value).toBe('G')
	})

	it('merges lyrics to the left and clears current', () => {
		const selectedMeasureIndex = ref<number | null>(1)
		const measures = computed<Measure[]>(() => [
			{ cells: [{ type: 'chord', value: 'C' }], lyricsHint: 'Prev' },
			{ cells: [{ type: 'chord', value: 'G' }], lyricsHint: 'Current' }
		])
		const { mergeLyrics } = useGridMeasureEditor({ measures, selectedMeasureIndex })

		const next = mergeLyrics('left')

		expect(next[0]?.lyricsHint).toBe('Prev Current')
		expect(next[1]?.lyricsHint).toBeUndefined()
		expect(selectedMeasureIndex.value).toBe(1)
	})

	it('merges lyrics to the right and clears current', () => {
		const selectedMeasureIndex = ref<number | null>(0)
		const measures = computed<Measure[]>(() => [
			{ cells: [{ type: 'chord', value: 'C' }], lyricsHint: 'Current' },
			{ cells: [{ type: 'chord', value: 'G' }], lyricsHint: 'Next' }
		])
		const { mergeLyrics } = useGridMeasureEditor({ measures, selectedMeasureIndex })

		const next = mergeLyrics('right')

		expect(next[1]?.lyricsHint).toBe('Current Next')
		expect(next[0]?.lyricsHint).toBeUndefined()
		expect(selectedMeasureIndex.value).toBe(0)
	})
})
