import { describe, it, expect } from 'vitest'
import type { GridSection } from '@/lib/chordpro/types'
import { useGridSectionUpdater } from './useGridSectionUpdater'

describe('useGridSectionUpdater', () => {
	it('delegates updates to store', () => {
		let updatedIndex: number | null = null
		let updatedContent: GridSection | null = null
		const store = {
			gridSections: [
				{ index: 0, section: { content: { kind: 'grid', rows: [] } as GridSection } }
			],
			updateSectionContent: (index: number, content: GridSection) => {
				updatedIndex = index
				updatedContent = content
			}
		}

		const { updateGridSection, gridSections } = useGridSectionUpdater(store)
		const payload: GridSection = { kind: 'grid', rows: [] }

		updateGridSection(0, payload)

		expect(gridSections.value.length).toBe(1)
		expect(updatedIndex).toBe(0)
		expect(updatedContent).toBe(payload)
	})
})
