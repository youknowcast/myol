import { computed, type ComputedRef, type Ref } from 'vue'
import {
	autoAssignMeasures,
	generateChordPro,
	parseBeatsPerMeasure,
	parseChordPro,
	parseChordProToExtended
} from '@/lib/chordpro/parser'
import type { ParsedSong, GridSection } from '@/lib/chordpro/types'

export interface UseChordProDocumentOptions {
	content: Ref<string | null | undefined>
}

export interface UseChordProDocument {
	parsedSong: ComputedRef<ParsedSong | null>
	totalMeasures: ComputedRef<number>
	sectionMeasureOffsets: ComputedRef<number[]>
	serialize: () => string
	setContent: (next: string) => void
	autoAssignMeasuresToContent: (beatsPerMeasure?: number) => void
}

const BAR_TYPES = ['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth'] as const

type BarType = typeof BAR_TYPES[number]

function countMeasuresInGrid(grid: GridSection): number {
	if (grid.measures && grid.measures.length > 0) {
		return grid.measures.length
	}

	let count = 0
	let hasSeenFirstBar = false
	let hasSeenNonBarSinceLastBar = false

	for (const row of grid.rows) {
		for (const cell of row.cells) {
			const isBar = BAR_TYPES.includes(cell.type as BarType)

			if (isBar) {
				if (hasSeenFirstBar && hasSeenNonBarSinceLastBar) {
					count++
				}
				hasSeenFirstBar = true
				hasSeenNonBarSinceLastBar = false
			} else {
				hasSeenNonBarSinceLastBar = true
			}
		}
	}

	if (hasSeenFirstBar) {
		count++
	}

	return Math.max(count, 1)
}

export function useChordProDocument(options: UseChordProDocumentOptions): UseChordProDocument {
	const parsedSong = computed(() => {
		const source = options.content.value
		if (!source) return null
		return parseChordProToExtended(source)
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
		totalMeasures,
		sectionMeasureOffsets,
		serialize,
		setContent,
		autoAssignMeasuresToContent
	}
}
