import { computed, type ComputedRef, type Ref } from 'vue'
import {
	autoAssignMeasures,
	generateChordPro,
	parseBeatsPerMeasure,
	parseChordPro,
	parseChordProToExtended
} from '@/lib/chordpro/parser'
import type { ParsedSong, GridSection, LyricsSection, Section } from '@/lib/chordpro/types'

interface KaraokeGridRowContent {
	cells: GridSection['rows'][number]['cells']
	hint?: string
}

interface KaraokeLyricsRowContent {
	segments: LyricsSection['lines'][number]['segments']
}

function buildKaraokeRowContent(section: Section, rowIndex: number): KaraokeRow['content'] | null {
	if (section.content.kind === 'grid') {
		const grid = section.content as GridSection
		const row = grid.rows[rowIndex]
		if (!row) return null
		return {
			cells: row.cells,
			hint: grid.lyricsHints?.[rowIndex]
		} satisfies KaraokeGridRowContent
	}

	if (section.content.kind === 'lyrics') {
		const lyrics = section.content as LyricsSection
		const line = lyrics.lines[rowIndex]
		if (!line) return null
		return {
			segments: line.segments
		} satisfies KaraokeLyricsRowContent
	}

	return null
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
				let sectionMeasures = 0
				let hasSeenFirstBar = false
				let hasSeenNonBarSinceLastBar = false

				grid.rows.forEach((row, rowIndex) => {
					const rowStartMeasure = globalMeasureOffset + sectionMeasures

					row.cells.forEach(cell => {
						const isBar = BAR_TYPES.includes(cell.type as BarType)
						if (isBar) {
							if (hasSeenFirstBar && hasSeenNonBarSinceLastBar) {
								sectionMeasures++
							}
							hasSeenFirstBar = true
							hasSeenNonBarSinceLastBar = false
						} else {
							hasSeenNonBarSinceLastBar = true
						}
					})

					const rowEndMeasure = globalMeasureOffset + sectionMeasures
					rows.push({
						type: 'grid',
						sectionIndex,
						rowIndex,
						startMeasure: rowStartMeasure,
						endMeasure: rowEndMeasure,
						content: buildKaraokeRowContent(section, rowIndex)
					})
				})

				if (hasSeenFirstBar) {
					sectionMeasures++
				}
				globalMeasureOffset += sectionMeasures
			} else if (section.content.kind === 'lyrics') {
				const lyrics = section.content as LyricsSection
				lyrics.lines.forEach((_, rowIndex) => {
					const start = globalMeasureOffset + rowIndex
					rows.push({
						type: 'lyrics',
						sectionIndex,
						rowIndex,
						startMeasure: start,
						endMeasure: start,
						content: buildKaraokeRowContent(section, rowIndex)
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
