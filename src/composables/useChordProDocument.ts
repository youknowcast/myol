import { computed, type ComputedRef, type Ref } from 'vue'
import {
	autoAssignMeasures,
	generateChordPro,
	parseBeatsPerMeasure,
	parseChordPro,
	parseChordProToExtended
} from '@/lib/chordpro/parser'
import type { ParsedSong, GridSection, LyricsSection } from '@/lib/chordpro/types'


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
	autoAssignMeasuresToContent: (beatsPerMeasure?: number) => void
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
			} else if (section.content.kind === 'lyrics') {
				count += (section.content as LyricsSection).lines.length
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
			} else if (section.content.kind === 'lyrics') {
				offset += (section.content as LyricsSection).lines.length
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

	function autoAssignMeasuresToContent(beatsPerMeasure?: number) {
		const source = options.content.value
		if (!source) return
		const parsed = parseChordPro(source)
		const resolvedBeats = beatsPerMeasure ?? parseBeatsPerMeasure(parsed.time)
		const processed = autoAssignMeasures(parsed, resolvedBeats)
		options.content.value = generateChordPro(processed)
	}

	return {
		parsedSong,
		beatsPerMeasure,
		totalMeasures,
		sectionMeasureOffsets,
		serialize,
		setContent,
		autoAssignMeasuresToContent
	}
}
