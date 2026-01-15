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
	GridCell
} from './types'

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
		const directiveMatch = trimmed.match(/^\{([^:}]+)(?::\s*(.+))?\}$/)
		if (directiveMatch) {
			const [, directive, value] = directiveMatch
			if (!directive) continue
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
						currentSection.content = {
							kind: 'grid',
							shape: gridShape,
							rows: gridRows
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
			currentSection.content = { kind: 'grid', shape: gridShape, rows: gridRows } as GridSection
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
 * Convert a chord-only lyrics line to a Grid row with auto-assigned measures.
 * Detects lines that have only chords (no lyrics text).
 *
 * @param line - A LyricsLine to check and convert
 * @param beatsPerMeasure - Number of beats per measure
 * @returns GridRow if line is chord-only, null otherwise
 */
export function lyricsLineToGridRow(
	line: LyricsLine,
	beatsPerMeasure: number = 4
): GridRow | null {
	// Check if this line has only chords (all text segments are empty or whitespace)
	const isChordOnly = line.segments.every(
		seg => seg.chord !== null && seg.text.trim() === ''
	)

	if (!isChordOnly) {
		return null
	}

	// Extract chords
	const chords = line.segments
		.filter(seg => seg.chord !== null)
		.map(seg => seg.chord as string)

	if (chords.length === 0) {
		return null
	}

	return autoAssignMeasuresToGrid(chords, beatsPerMeasure)
}

/**
 * Auto-assign measures to all chord-only content in a ParsedSong.
 * Converts chord-only lyrics lines to grid sections with proper bar lines.
 *
 * @param song - The parsed song to process
 * @param beatsPerMeasure - Number of beats per measure (default: 4)
 * @returns A new ParsedSong with measures assigned
 */
export function autoAssignMeasures(
	song: ParsedSong,
	beatsPerMeasure: number = 4
): ParsedSong {
	const newSections: Section[] = []

	for (const section of song.sections) {
		if (section.content.kind === 'lyrics') {
			const lyricsContent = section.content as LyricsSection
			const gridRows: GridRow[] = []
			const remainingLyricsLines: LyricsLine[] = []
			let hasChordOnlyLines = false

			for (const line of lyricsContent.lines) {
				const gridRow = lyricsLineToGridRow(line, beatsPerMeasure)
				if (gridRow) {
					// This is a chord-only line, convert to grid
					hasChordOnlyLines = true
					gridRows.push(gridRow)
				} else {
					// Keep as lyrics
					remainingLyricsLines.push(line)
				}
			}

			// If we found chord-only lines, create a new grid section for them
			if (hasChordOnlyLines && gridRows.length > 0) {
				// Add grid section with converted chord-only lines
				newSections.push({
					type: 'grid',
					label: section.label ? `${section.label} (Grid)` : 'Chord Progression',
					content: {
						kind: 'grid',
						rows: gridRows
					} as GridSection
				})
			}

			// Keep remaining lyrics lines if any
			if (remainingLyricsLines.length > 0) {
				newSections.push({
					...section,
					content: {
						kind: 'lyrics',
						lines: remainingLyricsLines
					} as LyricsSection
				})
			} else if (!hasChordOnlyLines) {
				// No chord-only lines found, keep original section
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
			for (const row of section.content.rows) {
				lines.push(row.cells.map(cellToString).join(' '))
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
