import { computed, type ComputedRef, type Ref } from 'vue'
import {
	generateChordPro,
	parseBeatsPerMeasure,
	parseChordProToExtended
} from '@/lib/chordpro/parser'
import type { ParsedSong, GridSection } from '@/lib/chordpro/types'


export interface UseChordProDocumentOptions {
	content: Ref<string | null | undefined>
}


export interface UseChordProDocument {
	parsedSong: ComputedRef<ParsedSong | null>
	beatsPerMeasure: ComputedRef<number>
	totalMeasures: ComputedRef<number>
	sectionMeasureOffsets: ComputedRef<number[]>
	serialize: () => string
	setContent: (next: string) => void
}


function countMeasuresInGrid(grid: GridSection): number {
	return Math.max(grid.measures.length, 1)
}

export function useChordProDocument(options: UseChordProDocumentOptions): UseChordProDocument {
	const parsedSong = computed(() => {
		const source = options.content.value
		if (!source) return null
		return parseChordProToExtended(source)
	})

	const beatsPerMeasure = computed(() => {
		if (!parsedSong.value) return 4
		return parseBeatsPerMeasure(parsedSong.value.time)
	})

	const totalMeasures = computed(() => {
		if (!parsedSong.value) return 1
		let count = 0
		for (const section of parsedSong.value.sections) {
			if (section.content.kind === 'grid') {
				count += countMeasuresInGrid(section.content as GridSection)
			}
		}
		return Math.max(count, 1)
	})

	const sectionMeasureOffsets = computed(() => {
		if (!parsedSong.value) return []
		const offsets: number[] = []
		let offset = 0
		for (const section of parsedSong.value.sections) {
			offsets.push(offset)
			if (section.content.kind === 'grid') {
				offset += countMeasuresInGrid(section.content as GridSection)
			}
		}
		return offsets
	})


	function serialize(): string {
		if (!parsedSong.value) return options.content.value ?? ''
		return generateChordPro(parsedSong.value)
	}

	function setContent(next: string) {
		options.content.value = next
	}

	return {
		parsedSong,
		beatsPerMeasure,
		totalMeasures,
		sectionMeasureOffsets,
		serialize,
		setContent
	}
}
