import Sortable, { type SortableEvent } from 'sortablejs'

export type SortableInstance = { destroy: () => void }
export type SortableFactory = (element: HTMLElement, options: Sortable.Options) => SortableInstance

export interface UseSortableGridOptions {
	onReorder: (measureIndex: number, orderedCellIds: string[]) => void
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
				onEnd: (evt: SortableEvent) => {
					const measureIndexStr = evt.to.getAttribute('data-measure-index')
					if (measureIndexStr === null) return
					const measureIndex = Number.parseInt(measureIndexStr, 10)
					if (Number.isNaN(measureIndex)) return

					const items = Array.from(evt.to.querySelectorAll('[data-id]'))
						.map(el => el.getAttribute('data-id'))
						.filter((id): id is string => Boolean(id))

					options.onReorder(measureIndex, items)
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
