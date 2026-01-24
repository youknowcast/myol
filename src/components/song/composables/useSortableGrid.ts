import Sortable, { type SortableEvent } from 'sortablejs'

export type SortableInstance = { destroy: () => void }
export type SortableFactory = (element: HTMLElement, options: Sortable.Options) => SortableInstance

export interface SortableReorderPayload {
	fromSectionIndex: number
	toSectionIndex: number
	fromMeasureIndex: number
	toMeasureIndex: number
	fromOrder: string[]
	toOrder: string[]
	movedCellId: string | null
	oldIndex: number | null
	newIndex: number | null
}

export interface UseSortableGridOptions {
	onReorder: (payload: SortableReorderPayload) => void
	createSortable?: SortableFactory
	selector?: string
}

export function useSortableGrid(options: UseSortableGridOptions) {
	const selector = options.selector ?? '.measure-cells'
	let instances: SortableInstance[] = []

	function destroy() {
		instances.forEach(instance => instance.destroy())
		instances = []
	}

	function getMeasureIndex(element: HTMLElement | null): number | null {
		if (!element) return null
		const measureIndexStr = element.getAttribute('data-measure-index')
		if (!measureIndexStr) return null
		const measureIndex = Number.parseInt(measureIndexStr, 10)
		return Number.isNaN(measureIndex) ? null : measureIndex
	}

	function getOrderedIds(container: HTMLElement): string[] {
		return Array.from(container.querySelectorAll('[data-id]'))
			.map(el => el.getAttribute('data-id'))
			.filter((id): id is string => Boolean(id))
	}

	function getSectionIndex(element: HTMLElement | null): number | null {
		if (!element) return null
		const directIndex = element.getAttribute('data-section-index')
		if (directIndex) {
			const parsed = Number.parseInt(directIndex, 10)
			return Number.isNaN(parsed) ? null : parsed
		}
		const cell = element.closest('[data-section-index]') as HTMLElement | null
		if (!cell) return null
		const sectionIndexStr = cell.getAttribute('data-section-index')
		if (!sectionIndexStr) return null
		const sectionIndex = Number.parseInt(sectionIndexStr, 10)
		return Number.isNaN(sectionIndex) ? null : sectionIndex
	}

	function init(container: HTMLElement | null) {
		destroy()
		if (!container) return
		const createSortable = options.createSortable ?? Sortable.create
		const measureContainers = Array.from(container.querySelectorAll(selector))

		measureContainers.forEach((containerEl) => {
			const instance = createSortable(containerEl as HTMLElement, {
				animation: 150,
				ghostClass: 'cell-ghost',
				chosenClass: 'cell-chosen',
				dragClass: 'cell-drag',
				group: 'cells',
				filter: '.cell-empty',
				preventOnFilter: false,
				onEnd: (evt: SortableEvent) => {
					const fromMeasureIndex = getMeasureIndex(evt.from as HTMLElement)
					const toMeasureIndex = getMeasureIndex(evt.to as HTMLElement)
					if (fromMeasureIndex === null || toMeasureIndex === null) return

					const fromSectionIndex = getSectionIndex(evt.from as HTMLElement)
					const toSectionIndex = getSectionIndex(evt.to as HTMLElement)
					if (fromSectionIndex === null || toSectionIndex === null) return

					const fromOrder = getOrderedIds(evt.from as HTMLElement)
					const toOrder = getOrderedIds(evt.to as HTMLElement)
					const movedCellId = (evt.item as HTMLElement | null)?.getAttribute('data-id') ?? null

					options.onReorder({
						fromSectionIndex,
						toSectionIndex,
						fromMeasureIndex,
						toMeasureIndex,
						fromOrder,
						toOrder,
						movedCellId,
						oldIndex: typeof evt.oldIndex === 'number' ? evt.oldIndex : null,
						newIndex: typeof evt.newIndex === 'number' ? evt.newIndex : null
					})
				}
			})
			instances.push(instance)
		})
	}

	return {
		init,
		destroy
	}
}
