import { describe, it, expect } from 'vitest'
import { computed } from 'vue'
import { useEditableMeasures } from './useEditableMeasures'
import type { Measure } from '@/lib/chordpro/types'

describe('useEditableMeasures', () => {
	it('assigns stable ids embedding measure and cell indices', () => {
		const measures = computed<Measure[]>(() => [
			{ cells: [{ type: 'chord', value: 'G' }, { type: 'empty' }], startBar: 'repeatStart' }
		])
		const { displayMeasures } = useEditableMeasures(measures)
		expect(displayMeasures.value[0]!.cells.map(c => c.id)).toEqual(['0-0-G', '0-1-empty'])
		expect(displayMeasures.value[0]!.startBar).toBe('repeatStart')
	})
})
