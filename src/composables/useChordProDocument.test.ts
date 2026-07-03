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

	it('counts only grid measures, excluding lyrics-only sections', () => {
		const content = ref(`{start_of_grid}
|| C . | G . ||
{end_of_grid}

{start_of_verse}
just text line one
just text line two
just text line three
{end_of_verse}

{start_of_grid}
|| Am . | F . ||
{end_of_grid}
`)
		const { totalMeasures, sectionMeasureOffsets } = useChordProDocument({ content })
		expect(totalMeasures.value).toBe(4)
		expect(sectionMeasureOffsets.value).toEqual([0, 2, 2])
	})
})
