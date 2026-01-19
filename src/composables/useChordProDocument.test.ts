import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useChordProDocument } from './useChordProDocument'

const sampleGridContent = `{title: Sample}

{start_of_grid}
|| C . . . | G . . . ||
{end_of_grid}

{start_of_grid}
|| Am . . . ||
{end_of_grid}
`

describe('useChordProDocument', () => {
	it('parses content into extended format', () => {
		const content = ref(`{start_of_verse}
[C]Hello [G]world
{end_of_verse}
`)
		const { parsedSong } = useChordProDocument({ content })

		const gridSection = parsedSong.value?.sections.find(section => section.content.kind === 'grid')
		expect(gridSection).toBeTruthy()
	})

	it('calculates total measures and offsets', () => {
		const content = ref(sampleGridContent)
		const { totalMeasures, sectionMeasureOffsets } = useChordProDocument({ content })

		expect(totalMeasures.value).toBe(3)
		expect(sectionMeasureOffsets.value).toEqual([0, 2])
	})

	it('auto-assigns measures into content', () => {
		const content = ref(`{start_of_verse}
[C]Hello [G]world
{end_of_verse}
`)
		const { autoAssignMeasuresToContent } = useChordProDocument({ content })

		autoAssignMeasuresToContent(4)
		expect(content.value.includes('{start_of_grid')).toBe(true)
	})
})
