import { computed, type ComputedRef } from 'vue'
import type { GridCell, Measure } from '@/lib/chordpro/types'

export interface EditableMeasure extends Measure {
	cells: ({ id: string } & GridCell)[]
}

export function useEditableMeasures(measures: ComputedRef<Measure[]>) {
	const displayMeasures = computed<EditableMeasure[]>(() =>
		measures.value.map((measure, index) => ({
			...measure,
			cells: measure.cells.map((cell, cellIndex) => ({
				id: `${index}-${cellIndex}-${cell.type === 'chord' ? cell.value ?? 'chord' : cell.type}`,
				...cell
			}))
		}))
	)

	return { displayMeasures }
}
