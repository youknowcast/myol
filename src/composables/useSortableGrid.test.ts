import { describe, it, expect, vi } from 'vitest'
import { useSortableGrid } from './useSortableGrid'

function createMeasureContainer(index: number, ids: string[]) {
	return {
		getAttribute: (name: string) => (name === 'data-measure-index' ? String(index) : null),
		querySelectorAll: (selector: string) => {
			if (selector !== '[data-id]') return []
			return ids.map(id => ({ getAttribute: () => id }))
		}
	} as unknown as HTMLElement
}

describe('useSortableGrid', () => {
	it('initializes sortable and forwards reorder events', () => {
		const onReorder = vi.fn()
		const created: Array<{ element: HTMLElement; options: any }> = []
		const createSortable = (element: HTMLElement, options: any) => {
			created.push({ element, options })
			return { destroy: () => undefined }
		}

		const { init } = useSortableGrid({ onReorder, createSortable })
		const container = {
			querySelectorAll: () => [
				createMeasureContainer(0, ['a', 'b']),
				createMeasureContainer(1, ['c'])
			]
		} as unknown as HTMLElement

		init(container)
		expect(created.length).toBe(2)

		const onEnd = created[0]?.options.onEnd
		onEnd({ to: created[0]?.element })

		expect(onReorder).toHaveBeenCalledWith(0, ['a', 'b'])
	})
})
