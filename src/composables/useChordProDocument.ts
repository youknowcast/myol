import { computed, type ComputedRef, type Ref } from 'vue'
import {
	autoAssignMeasures,
	generateChordPro,
	gridRowsFromMeasures,
	parseBeatsPerMeasure,
	parseChordPro,
	parseChordProToExtended
} from '@/lib/chordpro/parser'
import type { ParsedSong, GridSection, LyricsSection, GridCell } from '@/lib/chordpro/types'

interface KaraokeGridRowContent {
	cells: GridCell[]
	hint?: string
}

interface KaraokeLyricsRowContent {
	segments: LyricsSection['lines'][number]['segments']
}

function buildGridRowHint(grid: GridSection, startMeasure: number, endMeasure: number): string | undefined {
	if (grid.measures.length === 0) return undefined
	const hints = grid.measures
		.slice(startMeasure, endMeasure + 1)
		.map(measure => measure.lyricsHint)
		.filter((hint): hint is string => Boolean(hint && hint.trim()))

	if (hints.length === 0) return undefined
	return hints.join(' ')
}

export interface UseChordProDocumentOptions {
	content: Ref<string | null | undefined>
}

export interface KaraokeRow {
	type: 'grid' | 'lyrics' | 'label' | 'spacer'
	sectionIndex: number
	rowIndex: number
	startMeasure: number
	endMeasure: number
	content: unknown
}

export interface UseChordProDocument {
	parsedSong: ComputedRef<ParsedSong | null>
	beatsPerMeasure: ComputedRef<number>
	totalMeasures: ComputedRef<number>
	sectionMeasureOffsets: ComputedRef<number[]>
	karaokeRows: ComputedRef<KaraokeRow[]>
	serialize: () => string
	setContent: (next: string) => void
	autoAssignMeasuresToContent: (beatsPerMeasure?: number) => void
}

const MEASURES_PER_ROW = 4

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

	const karaokeRows = computed(() => {
		if (!parsedSong.value) return []
		const rows: KaraokeRow[] = []
		let globalMeasureOffset = 0

		parsedSong.value.sections.forEach((section, sectionIndex) => {
			if (section.label) {
				rows.push({
					type: 'label',
					sectionIndex,
					rowIndex: -1,
					startMeasure: globalMeasureOffset,
					endMeasure: globalMeasureOffset,
					content: section.label
				})
			}

			if (section.content.kind === 'grid') {
				const grid = section.content as GridSection
				const gridMeasures = grid.measures
				const rowCells = gridRowsFromMeasures(gridMeasures, MEASURES_PER_ROW)

				rowCells.forEach((row, rowIndex) => {
					const rowStartMeasure = globalMeasureOffset + rowIndex * MEASURES_PER_ROW
					const rowEndMeasure = Math.min(
						globalMeasureOffset + gridMeasures.length - 1,
						rowStartMeasure + MEASURES_PER_ROW - 1
					)

					rows.push({
						type: 'grid',
						sectionIndex,
						rowIndex,
						startMeasure: rowStartMeasure,
						endMeasure: rowEndMeasure,
						content: {
							cells: row.cells,
							hint: buildGridRowHint(grid, rowStartMeasure - globalMeasureOffset, rowEndMeasure - globalMeasureOffset)
						} satisfies KaraokeGridRowContent
					})
				})

				globalMeasureOffset += gridMeasures.length
			} else if (section.content.kind === 'lyrics') {
				const lyrics = section.content as LyricsSection
				lyrics.lines.forEach((line, rowIndex) => {
					const start = globalMeasureOffset + rowIndex
					rows.push({
						type: 'lyrics',
						sectionIndex,
						rowIndex,
						startMeasure: start,
						endMeasure: start,
						content: {
							segments: line.segments
						} satisfies KaraokeLyricsRowContent
					})
				})
				globalMeasureOffset += lyrics.lines.length
			}

			rows.push({
				type: 'spacer',
				sectionIndex,
				rowIndex: -1,
				startMeasure: globalMeasureOffset,
				endMeasure: globalMeasureOffset,
				content: null
			})
		})

		return rows
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
		karaokeRows,
		serialize,
		setContent,
		autoAssignMeasuresToContent
	}
}
