import { computed, ref } from 'vue'
import type { GridSection, Section } from '@/lib/chordpro/types'

export interface GridSectionManagerStore {
	sections: Section[]
	gridSections: Array<{ index: number; section: Section }>
	updateSectionContent: (index: number, content: GridSection) => void
	updateSectionLabel: (index: number, label: string | undefined) => void
	addGridSection: (afterIndex?: number, label?: string) => void
	removeSection: (index: number) => void
	moveSection: (index: number, direction: 'up' | 'down') => void
	splitGridSection: (index: number, measureIndex: number, label?: string) => void
}

export function useGridSectionManager(store: GridSectionManagerStore) {
	const selectedMeasureBySection = ref<Record<number, number | null>>({})

	const gridSections = computed(() =>
		store.gridSections.map(({ section, index }) => ({
			section,
			index,
			displayLabel: section.label ?? `Section ${index + 1}`
		}))
	)

	function setSelectedMeasure(sectionIndex: number, measureIndex: number | null) {
		selectedMeasureBySection.value = {
			...selectedMeasureBySection.value,
			[sectionIndex]: measureIndex
		}
	}

	function getSelectedMeasure(sectionIndex: number): number | null {
		return selectedMeasureBySection.value[sectionIndex] ?? null
	}

	function canSplit(sectionIndex: number): boolean {
		const selected = getSelectedMeasure(sectionIndex)
		if (selected === null) return false
		const section = store.sections[sectionIndex]
		if (!section || section.content.kind !== 'grid') return false
		const measures = (section.content as GridSection).measures
		return selected >= 0 && selected < measures.length - 1
	}

	function updateLabel(sectionIndex: number, label: string) {
		store.updateSectionLabel(sectionIndex, label.trim() === '' ? undefined : label)
	}

	function addSection(afterIndex?: number) {
		store.addGridSection(afterIndex)
	}

	function removeSection(index: number) {
		store.removeSection(index)
	}

	function moveSection(index: number, direction: 'up' | 'down') {
		store.moveSection(index, direction)
	}

	function splitSection(index: number) {
		const measureIndex = getSelectedMeasure(index)
		if (measureIndex === null) return
		store.splitGridSection(index, measureIndex)
		setSelectedMeasure(index, null)
		setSelectedMeasure(index + 1, null)
	}

	function updateGridSection(index: number, content: GridSection) {
		store.updateSectionContent(index, content)
	}

	return {
		gridSections,
		selectedMeasureBySection,
		setSelectedMeasure,
		getSelectedMeasure,
		canSplit,
		updateLabel,
		addSection,
		removeSection,
		moveSection,
		splitSection,
		updateGridSection
	}
}
