import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { useGridMeasureActions } from './useGridMeasureActions'
import type { GridSection } from '@/lib/chordpro/types'

describe('useGridMeasureActions', () => {
	it('preserves startBar and endBar through emitUpdate when adding a measure', () => {
		const section: GridSection = {
			kind: 'grid',
			measures: [
				{ cells: [{ type: 'chord', value: 'G' }], startBar: 'repeatStart' },
				{ cells: [{ type: 'chord', value: 'D' }], endBar: 'repeatEnd' }
			]
		}
		const modelValue = computed(() => section)
		const selectedMeasureIndex = ref<number | null>(null)
		const onUpdate = vi.fn()

		const { handleAddMeasure } = useGridMeasureActions({
			modelValue,
			selectedMeasureIndex,
			onUpdate
		})

		handleAddMeasure('end')

		expect(onUpdate).toHaveBeenCalledTimes(1)
		const updated = onUpdate.mock.calls[0]?.[0] as GridSection
		expect(updated.measures[0]?.startBar).toBe('repeatStart')
		expect(updated.measures[1]?.endBar).toBe('repeatEnd')
		expect(updated.measures[2]?.startBar).toBeUndefined()
		expect(updated.measures[2]?.endBar).toBeUndefined()
	})
})
