import { computed } from 'vue'
import type { GridSection } from '@/lib/chordpro/types'

export interface GridSectionUpdaterStore {
	gridSections: Array<{ index: number; section: { content: GridSection } }>
	updateSectionContent: (index: number, content: GridSection) => void
}

export function useGridSectionUpdater(store: GridSectionUpdaterStore) {
	const gridSections = computed(() => store.gridSections)

	function updateGridSection(sectionIndex: number, newContent: GridSection) {
		store.updateSectionContent(sectionIndex, newContent)
	}

	return {
		gridSections,
		updateGridSection
	}
}
