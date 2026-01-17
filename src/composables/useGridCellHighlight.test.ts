import { describe, it, expect } from 'vitest'
import { useGridCellHighlight } from './useGridCellHighlight'

describe('useGridCellHighlight', () => {
	it('adds current-measure class for grid view', () => {
		const { getGridViewCellClass } = useGridCellHighlight()
		const classes = getGridViewCellClass({ type: 'chord', value: 'C', isCurrentMeasure: true })

		expect(classes).toContain('current-measure')
	})

	it('adds current-measure class for karaoke rows', () => {
		const { getKaraokeCellClass } = useGridCellHighlight()
		const classes = getKaraokeCellClass({ type: 'chord', value: 'C' }, {
			currentMeasure: 2,
			rowStartMeasure: 1,
			rowEndMeasure: 3
		})

		expect(classes).toContain('current-measure')
	})

	it('does not highlight bar cells in karaoke', () => {
		const { getKaraokeCellClass } = useGridCellHighlight()
		const classes = getKaraokeCellClass({ type: 'bar' }, {
			currentMeasure: 1,
			rowStartMeasure: 1,
			rowEndMeasure: 1
		})

		expect(classes).not.toContain('current-measure')
	})
})
