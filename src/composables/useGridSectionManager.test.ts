import { describe, it, expect } from 'vitest'
import { useGridSectionManager } from './useGridSectionManager'

const createStore = () => ({
	sections: [
		{ type: 'grid' as const, label: undefined, content: { kind: 'grid' as const, measures: [{ cells: [{ type: 'empty' as const }] }] } }
	],
	gridSections: [{ index: 0, section: { type: 'grid' as const, label: undefined, content: { kind: 'grid' as const, measures: [{ cells: [{ type: 'empty' as const }] }] } } }],
	updateSectionContent: () => undefined,
	updateSectionLabel: () => undefined,
	addGridSection: () => undefined,
	removeSection: () => undefined,
	moveSection: () => undefined,
	splitGridSection: () => undefined
})

describe('useGridSectionManager', () => {
	it('provides display labels', () => {
		const store = createStore()
		const { gridSections } = useGridSectionManager(store)
		expect(gridSections.value[0]?.displayLabel).toBe('Section 1')
	})

	it('reports split availability', () => {
		const store = createStore()
		const { setSelectedMeasure, canSplit } = useGridSectionManager(store)
		setSelectedMeasure(0, 0)
		expect(canSplit(0)).toBe(false)
	})
})
