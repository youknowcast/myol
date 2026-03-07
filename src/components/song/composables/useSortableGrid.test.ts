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
		const source = createMeasureContainer(0, ['a', 'b'])
		const target = createMeasureContainer(1, ['c'])
		const makeSectionContainer = (sectionIndex: number) => ({
			getAttribute: (name: string) => (name === 'data-section-index' ? String(sectionIndex) : null)
		})
		const container = {
			querySelectorAll: (selector: string) => (selector === '.measure-cells'
				? [source, target]
				: [])
		} as unknown as HTMLElement

		init(container)
		expect(created.length).toBe(2)

		const onEnd = created[0]?.options.onEnd
		onEnd({
			from: {
				...source,
				getAttribute: (name: string) => {
					if (name === 'data-section-index') return '2'
					if (name === 'data-measure-index') return '0'
					return null
				}
			},
			to: {
				...target,
				getAttribute: (name: string) => {
					if (name === 'data-section-index') return '2'
					if (name === 'data-measure-index') return '1'
					return null
				}
			},
			item: { getAttribute: () => 'a', closest: () => makeSectionContainer(2) },
			oldIndex: 0,
			newIndex: 1
		})

		expect(onReorder).toHaveBeenCalledWith({
			fromSectionIndex: 2,
			toSectionIndex: 2,
			fromMeasureIndex: 0,
			toMeasureIndex: 1,
			fromOrder: ['a', 'b'],
			toOrder: ['c'],
			movedCellId: 'a',
			oldIndex: 0,
			newIndex: 1
		})
	})
})
