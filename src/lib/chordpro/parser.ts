import type {
	ParsedSong,
	Section,
	SectionType,
	LyricsLine,
	LyricsSegment,
	LyricsSection,
	GridSection,
	TabSection,
	GridRow,
	GridCell,
	Measure
} from './types'

const BAR_TYPES = ['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth'] as const

type BarType = typeof BAR_TYPES[number]

function isBarCell(cell: GridCell): boolean {
	return BAR_TYPES.includes(cell.type as BarType)
}

export function parseBeatsPerMeasure(time?: string): number {
	if (!time) return 4
	const [beats] = time.split('/')
	const parsed = Number.parseInt(beats ?? '4', 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 4
}

function splitRowsIntoMeasures(rows: GridRow[]): { measures: Measure[]; rowStartIndices: number[] } {
	const measures: Measure[] = []
	const rowStartIndices: number[] = []

	rows.forEach((row, rowIndex) => {
		rowStartIndices[rowIndex] = measures.length
		let currentCells: GridCell[] = []

		for (const cell of row.cells) {
			if (isBarCell(cell)) {
				if (currentCells.length > 0) {
					measures.push({ cells: currentCells })
					currentCells = []
				}
				continue
			}
			currentCells.push({ ...cell })
		}

		if (currentCells.length > 0) {
			measures.push({ cells: currentCells })
		}
	})

	return { measures, rowStartIndices }
}

function applyLyricsHints(measures: Measure[], rowStartIndices: number[], lyricsHints?: string[]) {
	if (!lyricsHints || lyricsHints.length === 0 || measures.length === 0) return

	if (lyricsHints.length === measures.length) {
		lyricsHints.forEach((hint, index) => {
			measures[index]!.lyricsHint = hint
		})
		return
	}

	if (lyricsHints.length === rowStartIndices.length) {
		rowStartIndices.forEach((startIndex, rowIndex) => {
			const hint = lyricsHints[rowIndex]
			if (hint && measures[startIndex]) {
				measures[startIndex]!.lyricsHint = hint
			}
		})
		return
	}

	const limit = Math.min(lyricsHints.length, measures.length)
	for (let index = 0; index < limit; index += 1) {
		measures[index]!.lyricsHint = lyricsHints[index]
	}
}

function buildMeasuresFromRows(rows: GridRow[], lyricsHints?: string[]): Measure[] {
	const { measures, rowStartIndices } = splitRowsIntoMeasures(rows)
	applyLyricsHints(measures, rowStartIndices, lyricsHints)
	return measures
}

export function ensureGridMeasures(song: ParsedSong): ParsedSong {
	return song
}

export function parseChordProToExtended(content: string): ParsedSong {
	const parsed = parseChordPro(content)
	const beatsPerMeasure = parseBeatsPerMeasure(parsed.time)
	const normalized = autoAssignMeasures(parsed, beatsPerMeasure)
	return ensureGridMeasures(normalized)
}

/**
 * ChordPro parser
 * Parses ChordPro format text into structured data
 * Reference: https://www.chordpro.org/
 */
export function parseChordPro(content: string): ParsedSong {
	const lines = content.split('\n')

	const song: ParsedSong = {
		title: '',
		artist: '',
		sections: []
	}

	let currentSection: Section | null = null
	let inGrid = false
	let inTab = false
	let gridShape: string | undefined
	let gridRows: GridRow[] = []
	let gridLyricsHints: string[] = []
	let tabLines: string[] = []
	let lyricsLines: LyricsLine[] = []
	let currentLabel: string | undefined

	for (const line of lines) {
		const trimmed = line.trim()

		// Skip empty lines outside of sections
		if (!trimmed && !inGrid && !inTab && !currentSection) {
			continue
		}

		// Parse directives
		const directiveMatch = trimmed.match(/^\{([^}]+)\}$/)
		if (directiveMatch) {
			const rawDirective = directiveMatch[1]?.trim()
			if (!rawDirective) continue
			let directive = rawDirective
			let value: string | undefined
			const colonIndex = rawDirective.indexOf(':')
			if (colonIndex >= 0) {
				directive = rawDirective.slice(0, colonIndex).trim()
				value = rawDirective.slice(colonIndex + 1).trim()
			} else {
				const spaceMatch = rawDirective.match(/^(\S+)\s+(.+)$/)
				if (spaceMatch) {
					directive = spaceMatch[1] ?? rawDirective
					value = spaceMatch[2]?.trim()
				}
			}
			const dir = directive.toLowerCase().trim()
			const val = value?.trim()

			// Metadata directives
			if (dir === 'title' || dir === 't') {
				song.title = val || ''
				continue
			}
			if (dir === 'artist' || dir === 'a') {
				song.artist = val || ''
				continue
			}
			if (dir === 'key') {
				song.key = val
				continue
			}
			if (dir === 'capo') {
				song.capo = parseInt(val || '0', 10)
				continue
			}
			if (dir === 'tempo') {
				song.tempo = parseInt(val || '120', 10)
				continue
			}
			if (dir === 'time') {
				song.time = val
				continue
			}

			// Section start directives
			if (dir.startsWith('start_of_') || dir.startsWith('so')) {
				// Flush previous section
				if (currentSection) {
					song.sections.push(currentSection)
				}

				const sectionType = getSectionType(dir)
				currentLabel = extractLabel(val, dir)

				if (sectionType === 'grid') {
					inGrid = true
					gridShape = extractShape(val)
					gridRows = []
					gridLyricsHints = []
				} else if (sectionType === 'tab') {
					inTab = true
					tabLines = []
				} else {
					lyricsLines = []
				}

				currentSection = {
					type: sectionType,
					label: currentLabel,
					content: { kind: 'lyrics', lines: [] }
				}
				continue
			}

			// Section end directives
			if (dir.startsWith('end_of_') || dir.startsWith('eo')) {
				if (currentSection) {
					if (inGrid) {
						const measures = buildMeasuresFromRows(gridRows, gridLyricsHints)
						currentSection.content = {
							kind: 'grid',
							shape: gridShape,
							measures
						} as GridSection
						inGrid = false
					} else if (inTab) {
						currentSection.content = {
							kind: 'tab',
							lines: tabLines
						} as TabSection
						inTab = false
					} else {
						currentSection.content = {
							kind: 'lyrics',
							lines: lyricsLines
						} as LyricsSection
					}
					song.sections.push(currentSection)
					currentSection = null
				}
				continue
			}


			// {lyrics_hint: ...} directive for grid section lyrics
			if (dir === 'lyrics_hint' && inGrid && val) {
				gridLyricsHints.push(val)
				continue
			}

			// Other directives (comments, etc.) - skip for now
			continue
		}

		// Parse content based on current context
		if (inGrid) {
			const row = parseGridRow(trimmed)
			if (row.cells.length > 0) {
				gridRows.push(row)
			}
		} else if (inTab) {
			tabLines.push(line)
		} else if (currentSection || trimmed) {
			// Start implicit section if needed
			if (!currentSection && trimmed) {
				currentSection = {
					type: 'generic',
					content: { kind: 'lyrics', lines: [] }
				}
				lyricsLines = []
			}

			if (trimmed) {
				const lyricsLine = parseLyricsLine(trimmed)
				lyricsLines.push(lyricsLine)
			} else if (lyricsLines.length > 0) {
				// Empty line within a section - add empty line
				lyricsLines.push({ segments: [{ chord: null, text: '' }] })
			}
		}
	}

	// Flush remaining section
	if (currentSection) {
		if (inGrid) {
			const measures = buildMeasuresFromRows(gridRows, gridLyricsHints)
			currentSection.content = { kind: 'grid', shape: gridShape, measures } as GridSection
		} else if (inTab) {
			currentSection.content = { kind: 'tab', lines: tabLines } as TabSection
		} else {
			currentSection.content = { kind: 'lyrics', lines: lyricsLines } as LyricsSection
		}
		song.sections.push(currentSection)
	}

	return song
}

function getSectionType(directive: string): SectionType {
	const dir = directive.toLowerCase()
	if (dir.includes('verse') || dir === 'sov') return 'verse'
	if (dir.includes('chorus') || dir === 'soc') return 'chorus'
	if (dir.includes('bridge') || dir === 'sob') return 'bridge'
	if (dir.includes('intro')) return 'intro'
	if (dir.includes('outro')) return 'outro'
	if (dir.includes('grid') || dir === 'sog') return 'grid'
	if (dir.includes('tab') || dir === 'sot') return 'tab'
	return 'generic'
}

function extractLabel(value: string | undefined, _directive?: string): string | undefined {
	if (!value) return undefined

	// Extract label from directive value
	// Format: label="..." or just the value itself for legacy format
	const labelMatch = value.match(/label\s*=\s*"([^"]+)"/)
	if (labelMatch) return labelMatch[1]

	// Legacy format: {start_of_verse: Verse 1}
	if (!value.includes('=')) return value

	return undefined
}

function extractShape(value: string | undefined): string | undefined {
	if (!value) return undefined
	const shapeMatch = value.match(/shape\s*=\s*"([^"]+)"/)
	if (shapeMatch) return shapeMatch[1]

	// Legacy format: {start_of_grid: 4x4}
	const legacyMatch = value.match(/^(\d+x\d+|\d+\+\d+x\d+\+\d+)/)
	if (legacyMatch) return legacyMatch[1]

	return undefined
}

export function parseLyricsLine(line: string): LyricsLine {
	const segments: LyricsSegment[] = []
	const regex = /\[([^\]]+)\]/g
	let lastIndex = 0
	let match

	while ((match = regex.exec(line)) !== null) {
		// Text before the chord
		if (match.index > lastIndex) {
			const prevText = line.slice(lastIndex, match.index)
			if (segments.length > 0) {
				// Append to previous segment's text
				segments[segments.length - 1]!.text += prevText
			} else {
				segments.push({ chord: null, text: prevText })
			}
		}

		// Add segment with chord
		segments.push({ chord: match[1] ?? null, text: '' })
		lastIndex = regex.lastIndex
	}

	// Remaining text after last chord
	if (lastIndex < line.length) {
		const remainingText = line.slice(lastIndex)
		if (segments.length > 0) {
			segments[segments.length - 1]!.text += remainingText
		} else {
			segments.push({ chord: null, text: remainingText })
		}
	}

	// If no segments were created, add the whole line as text
	if (segments.length === 0) {
		segments.push({ chord: null, text: line })
	}

	return { segments }
}

export function parseGridRow(line: string): GridRow {
	const cells: GridCell[] = []
	const tokens = line.split(/\s+/).filter(t => t)

	for (const token of tokens) {
		// Bar lines
		if (token === '||') {
			cells.push({ type: 'barDouble' })
		} else if (token === '|.') {
			cells.push({ type: 'barEnd' })
		} else if (token === '|:') {
			cells.push({ type: 'repeatStart' })
		} else if (token === ':|') {
			cells.push({ type: 'repeatEnd' })
		} else if (token === ':|:') {
			cells.push({ type: 'repeatBoth' })
		} else if (token === '|') {
			cells.push({ type: 'bar' })
		}
		// Empty beat
		else if (token === '.') {
			cells.push({ type: 'empty' })
		}
		// Repeat measure
		else if (token === '%' || token === '%%') {
			cells.push({ type: 'repeat', value: token })
		}
		// Chord
		else {
			cells.push({ type: 'chord', value: token })
		}
	}

	return { cells }
}

/**
 * Auto-assign measure bar lines to a Grid section based on time signature.
 * This function takes chord-only content and inserts bar lines at regular intervals.
 *
 * @param chords - Array of chord strings (e.g., ['C', 'Am', 'F', 'G'])
 * @param beatsPerMeasure - Number of beats per measure (e.g., 4 for 4/4 time)
 * @param chordsPerBeat - Number of chords per beat (default: 1)
 * @returns GridRow with chords and bar lines
 */
export function autoAssignMeasuresToGrid(
	chords: string[],
	beatsPerMeasure: number = 4,
	chordsPerBeat: number = 1
): GridRow {
	const cells: GridCell[] = []
	const chordsPerMeasure = beatsPerMeasure * chordsPerBeat

	// Start with opening bar
	cells.push({ type: 'barDouble' })

	for (let i = 0; i < chords.length; i++) {
		cells.push({ type: 'chord', value: chords[i] })

		// Insert bar line after every measure (except at the very end)
		if ((i + 1) % chordsPerMeasure === 0 && i < chords.length - 1) {
			cells.push({ type: 'bar' })
		}
	}

	// End with closing bar
	cells.push({ type: 'barDouble' })

	return { cells }
}

/**
 * Convert a lyrics line to a Grid row with auto-assigned measures.
 * Also extracts lyrics text as a hint for display.
 *
 * @param line - A LyricsLine to convert
 * @param beatsPerMeasure - Number of beats per measure
 * @param includeWithLyrics - If true, also convert lines with lyrics (default: false for backward compat)
 * @returns Object with gridRow and lyricsHint, or null if not convertible
 */
export function lyricsLineToGridRow(
	line: LyricsLine,
	beatsPerMeasure: number = 4,
	includeWithLyrics: boolean = false
): { row: GridRow; lyrics: string } | null {
	// Check if this line has any chords
	const hasChords = line.segments.some(seg => seg.chord !== null)
	if (!hasChords) {
		return null
	}

	// Check if this line has only chords (no lyrics text)
	const isChordOnly = line.segments.every(
		seg => seg.chord !== null && seg.text.trim() === ''
	)

	// If line has lyrics and we're not including them, skip
	if (!isChordOnly && !includeWithLyrics) {
		return null
	}

	// Extract chords
	const chords = line.segments
		.filter(seg => seg.chord !== null)
		.map(seg => seg.chord as string)

	if (chords.length === 0) {
		return null
	}

	// Extract lyrics text (concatenate all text segments)
	const lyrics = line.segments
		.map(seg => seg.text)
		.join('')
		.trim()

	return {
		row: autoAssignMeasuresToGrid(chords, beatsPerMeasure),
		lyrics
	}
}

/**
 * Auto-assign measures to all chord-only content in a ParsedSong.
 * Converts chord-only lyrics lines to grid sections with proper bar lines.
 *
 * @param song - The parsed song to process
 * @param beatsPerMeasure - Number of beats per measure (default: 4)
 * @returns A new ParsedSong with measures assigned
 */
export function gridRowsFromMeasures(measures: Measure[], measuresPerRow: number = 4): GridRow[] {
	const rows: GridRow[] = []
	let currentRowCells: GridCell[] = []
	let measureCount = 0
	let isFirst = true

	for (const measure of measures) {
		if (isFirst) {
			currentRowCells.push({ type: 'barDouble' })
			isFirst = false
		} else {
			currentRowCells.push({ type: 'bar' })
		}

		currentRowCells.push(...measure.cells.map(cell => ({ ...cell })))
		measureCount++

		if (measureCount >= measuresPerRow) {
			currentRowCells.push({ type: 'barDouble' })
			rows.push({ cells: currentRowCells })
			currentRowCells = []
			measureCount = 0
			isFirst = true
		}
	}

	if (currentRowCells.length > 0) {
		currentRowCells.push({ type: 'barDouble' })
		rows.push({ cells: currentRowCells })
	}

	return rows
}

export function autoAssignMeasures(
	song: ParsedSong,
	beatsPerMeasure: number = 4
): ParsedSong {
	const newSections: Section[] = []

	for (const section of song.sections) {
		if (section.content.kind === 'lyrics') {
			const lyricsContent = section.content as LyricsSection
			const gridRows: GridRow[] = []
			const lyricsHints: string[] = []
			const remainingLyricsLines: LyricsLine[] = []
			let hasConvertedLines = false

			for (const line of lyricsContent.lines) {
				// Try to convert with lyrics included
				const result = lyricsLineToGridRow(line, beatsPerMeasure, true)
				if (result) {
					// This line has chords, convert to grid
					hasConvertedLines = true
					gridRows.push(result.row)
					if (result.lyrics) {
						lyricsHints.push(result.lyrics)
					}
				} else {
					// No chords, keep as lyrics (text-only lines)
					remainingLyricsLines.push(line)
				}
			}

			// If we found convertible lines, create a new grid section for them
			if (hasConvertedLines && gridRows.length > 0) {
				const measures = buildMeasuresFromRows(gridRows, lyricsHints)
				newSections.push({
					type: 'grid',
					label: section.label ? `${section.label} (Grid)` : 'Chord Progression',
					content: {
						kind: 'grid',
						measures
					} as GridSection
				})
			}

			// Keep remaining lyrics lines if any (text-only lines without chords)
			if (remainingLyricsLines.length > 0) {
				newSections.push({
					...section,
					content: {
						kind: 'lyrics',
						lines: remainingLyricsLines
					} as LyricsSection
				})
			} else if (!hasConvertedLines) {
				// No convertible lines found, keep original section
				newSections.push(section)
			}
		} else {
			// Keep grid and tab sections as-is
			newSections.push(section)
		}
	}

	return {
		...song,
		sections: newSections
	}
}

/**
 * Generate ChordPro content from a ParsedSong
 */
export function generateChordPro(song: ParsedSong): string {
	const lines: string[] = []

	// Metadata
	if (song.title) lines.push(`{title: ${song.title}}`)
	if (song.artist) lines.push(`{artist: ${song.artist}}`)
	if (song.key) lines.push(`{key: ${song.key}}`)
	if (song.capo !== undefined) lines.push(`{capo: ${song.capo}}`)
	if (song.tempo !== undefined) lines.push(`{tempo: ${song.tempo}}`)
	if (song.time) lines.push(`{time: ${song.time}}`)

	lines.push('')

	// Sections
	for (const section of song.sections) {
		const labelPart = section.label ? ` label="${section.label}"` : ''

		if (section.content.kind === 'grid') {
			const shapePart = section.content.shape ? ` shape="${section.content.shape}"` : ''
			lines.push(`{start_of_grid${labelPart}${shapePart}}`)

			const rows = gridRowsFromMeasures(section.content.measures)
			for (const row of rows) {
				lines.push(row.cells.map(cellToString).join(' '))
			}
			for (const measure of section.content.measures) {
				const hint = measure.lyricsHint?.trim()
				if (hint) {
					lines.push(`{lyrics_hint: ${hint}}`)
				}
			}
			lines.push(`{end_of_grid}`)
		} else if (section.content.kind === 'tab') {
			lines.push(`{start_of_tab${labelPart}}`)
			lines.push(...section.content.lines)
			lines.push(`{end_of_tab}`)
		} else {
			const directive = sectionTypeToDirective(section.type)
			lines.push(`{start_of_${directive}${labelPart}}`)
			for (const line of section.content.lines) {
				lines.push(lyricsLineToString(line))
			}
			lines.push(`{end_of_${directive}}`)
		}
		lines.push('')
	}

	return lines.join('\n')
}

function cellToString(cell: GridCell): string {
	switch (cell.type) {
		case 'bar': return '|'
		case 'barDouble': return '||'
		case 'barEnd': return '|.'
		case 'repeatStart': return '|:'
		case 'repeatEnd': return ':|'
		case 'repeatBoth': return ':|:'
		case 'empty': return '.'
		case 'repeat': return cell.value || '%'
		case 'chord': return cell.value || ''
		default: return ''
	}
}

function lyricsLineToString(line: LyricsLine): string {
	return line.segments.map(seg => {
		if (seg.chord) {
			return `[${seg.chord}]${seg.text}`
		}
		return seg.text
	}).join('')
}

function sectionTypeToDirective(type: SectionType): string {
	switch (type) {
		case 'verse': return 'verse'
		case 'chorus': return 'chorus'
		case 'bridge': return 'bridge'
		case 'intro': return 'intro'
		case 'outro': return 'outro'
		default: return 'verse'
	}
}
