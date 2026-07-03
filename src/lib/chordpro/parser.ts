import type {
	ParsedSong,
	Section,
	SectionType,
	LyricsLine,
	LyricsSegment,
	LyricsSection,
	GridSection,
	TabSection,
	GridCell,
	Measure
} from './types'


export function parseBeatsPerMeasure(time?: string): number {
	if (!time) return 4
	const [beats] = time.split('/')
	const parsed = Number.parseInt(beats ?? '4', 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 4
}

// 小節注釈ディレクティブのレジストリ。
// 「グリッド行の直前に置き、| 区切りで各小節へ 1:1 対応」する注釈の一般機構。
// 将来 stroke 等を足す場合はここに directive → Measure フィールドを登録する。
type MeasureAnnotationField = 'lyricsHint'

const MEASURE_ANNOTATION_DIRECTIVES: Record<string, MeasureAnnotationField> = {
	lyrics_hint: 'lyricsHint'
}

interface MeasureAnnotationEntry {
	field: MeasureAnnotationField
	value: string
}

interface GridLineEntry {
	measures: Measure[]
	annotations: MeasureAnnotationEntry[]
}

function parseGridLineToMeasures(
	line: string,
	carriedStartBar?: Measure['startBar']
): { measures: Measure[]; danglingStartBar?: Measure['startBar'] } {
	const measures: Measure[] = []
	let currentCells: GridCell[] = []
	let pendingStartBar: Measure['startBar'] = carriedStartBar

	function closeMeasure(endBar?: Measure['endBar']) {
		if (currentCells.length > 0) {
			const measure: Measure = { cells: currentCells }
			if (pendingStartBar) measure.startBar = pendingStartBar
			if (endBar) measure.endBar = endBar
			measures.push(measure)
			currentCells = []
			pendingStartBar = undefined
			return
		}
		const last = measures[measures.length - 1]
		if (endBar && last && !last.endBar) {
			last.endBar = endBar
		}
	}

	const tokens = line.split(/\s+/).filter(token => token)
	for (const token of tokens) {
		switch (token) {
			case '|':
			case '||':
				closeMeasure()
				break
			case '|.':
				closeMeasure('barEnd')
				break
			case '|:':
				closeMeasure()
				pendingStartBar = 'repeatStart'
				break
			case ':|':
				closeMeasure('repeatEnd')
				break
			case ':|:':
				closeMeasure('repeatEnd')
				pendingStartBar = 'repeatStart'
				break
			case '.':
				currentCells.push({ type: 'empty' })
				break
			case '/':
				currentCells.push({ type: 'noChord' })
				break
			case '%':
			case '%%':
				currentCells.push({ type: 'repeat', value: token })
				break
			default:
				currentCells.push({ type: 'chord', value: token })
		}
	}
	closeMeasure()
	return { measures, danglingStartBar: pendingStartBar }
}

function buildGridMeasures(entries: GridLineEntry[], trailing: MeasureAnnotationEntry[]): Measure[] {
	const measures = entries.flatMap(entry => entry.measures)
	const lyricsPerLine = entries.map(entry =>
		entry.annotations.filter(annotation => annotation.field === 'lyricsHint')
	)
	const trailingLyrics = trailing.filter(annotation => annotation.field === 'lyricsHint')
	const isPositional = trailingLyrics.length === 0 && lyricsPerLine.every(list => list.length <= 1)

	if (isPositional) {
		for (const entry of entries) {
			for (const annotation of entry.annotations) {
				const segments = annotation.value.split('|').map(segment => segment.trim())
				segments.forEach((segment, index) => {
					const measure = entry.measures[index]
					if (segment && measure) {
						measure[annotation.field] = segment
					}
				})
			}
		}
		return measures
	}

	// レガシー形式（トレイリングブロック / 1行に複数ヒント）: 個数ヒューリスティックで解釈
	const rowStartIndices: number[] = []
	let offset = 0
	for (const entry of entries) {
		rowStartIndices.push(offset)
		offset += entry.measures.length
	}
	const hints = [...lyricsPerLine.flat(), ...trailingLyrics].map(annotation => annotation.value)
	parseLegacyLyricsHints(measures, rowStartIndices, hints)
	return measures
}


function parseLegacyLyricsHints(measures: Measure[], rowStartIndices: number[], lyricsHints?: string[]) {
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

function lyricsLineToMeasures(
	line: LyricsLine,
	beatsPerMeasure: number
): { measures: Measure[] } | null {
	const chords = line.segments
		.filter(segment => segment.chord !== null)
		.map(segment => segment.chord as string)
	if (chords.length === 0) return null

	const lyrics = line.segments
		.map(segment => segment.text)
		.join('')
		.trim()

	const measures: Measure[] = []
	for (let start = 0; start < chords.length; start += beatsPerMeasure) {
		measures.push({
			cells: chords.slice(start, start + beatsPerMeasure).map(chord => ({ type: 'chord', value: chord }))
		})
	}
	if (lyrics && measures[0]) {
		measures[0].lyricsHint = lyrics
	}
	return { measures }
}


export function parseChordProToExtended(content: string): ParsedSong {
	const parsed = parseChordPro(content)
	const beatsPerMeasure = parseBeatsPerMeasure(parsed.time)
	return autoAssignMeasures(parsed, beatsPerMeasure)
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
	let gridLines: GridLineEntry[] = []
	let pendingAnnotations: MeasureAnnotationEntry[] = []
	let gridCarryStartBar: Measure['startBar']
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
					gridLines = []
					pendingAnnotations = []
					gridCarryStartBar = undefined
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
						const measures = buildGridMeasures(gridLines, pendingAnnotations)
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


			// 小節注釈ディレクティブ（{lyrics_hint: ...} 等）: 次のグリッド行に対応付ける
			const annotationField = MEASURE_ANNOTATION_DIRECTIVES[dir]
			if (annotationField && inGrid && val) {
				pendingAnnotations.push({ field: annotationField, value: val })
				continue
			}

			// Other directives (comments, etc.) - skip for now
			continue
		}

		// Parse content based on current context
		if (inGrid) {
			const { measures, danglingStartBar } = parseGridLineToMeasures(trimmed, gridCarryStartBar)
			gridCarryStartBar = danglingStartBar
			if (measures.length > 0) {
				gridLines.push({ measures, annotations: pendingAnnotations })
				pendingAnnotations = []
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
			const measures = buildGridMeasures(gridLines, pendingAnnotations)
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



export function autoAssignMeasures(
	song: ParsedSong,
	beatsPerMeasure: number = 4
): ParsedSong {
	const newSections: Section[] = []

	for (const section of song.sections) {
		if (section.content.kind !== 'lyrics') {
			newSections.push(section)
			continue
		}

		const gridMeasures: Measure[] = []
		const remainingLyricsLines: LyricsLine[] = []

		for (const line of section.content.lines) {
			const result = lyricsLineToMeasures(line, beatsPerMeasure)
			if (result) {
				gridMeasures.push(...result.measures)
			} else {
				remainingLyricsLines.push(line)
			}
		}

		if (gridMeasures.length > 0) {
			newSections.push({
				type: 'grid',
				label: section.label ? `${section.label} (Grid)` : 'Chord Progression',
				content: {
					kind: 'grid',
					measures: gridMeasures
				} as GridSection
			})
		}

		if (remainingLyricsLines.length > 0) {
			newSections.push({
				...section,
				content: {
					kind: 'lyrics',
					lines: remainingLyricsLines
				} as LyricsSection
			})
		} else if (gridMeasures.length === 0) {
			newSections.push(section)
		}
	}

	return {
		...song,
		sections: newSections
	}
}

const MEASURES_PER_LINE = 4

function sanitizeAnnotationSegment(segment: string): string {
	return segment.replace(/\|/g, '｜').trim()
}

function gridAnnotationLine(measures: Measure[]): string | null {
	const segments = measures.map(measure => sanitizeAnnotationSegment(measure.lyricsHint ?? ''))
	while (segments.length > 0 && segments[segments.length - 1] === '') {
		segments.pop()
	}
	if (segments.length === 0) return null
	return `{lyrics_hint: ${segments.join(' | ')}}`
}

function boundaryTokens(endBar: Measure['endBar'], startBar: Measure['startBar']): string[] {
	if (endBar === 'repeatEnd' && startBar === 'repeatStart') return [':|:']
	const tokens: string[] = []
	if (endBar === 'repeatEnd') tokens.push(':|')
	if (endBar === 'barEnd') tokens.push('|.')
	if (startBar === 'repeatStart') tokens.push('|:')
	if (tokens.length === 0) tokens.push('|')
	return tokens
}

function gridMeasuresToLine(measures: Measure[]): string {
	const tokens: string[] = []
	measures.forEach((measure, index) => {
		if (index === 0) {
			tokens.push(measure.startBar === 'repeatStart' ? '|:' : '||')
		} else {
			tokens.push(...boundaryTokens(measures[index - 1]!.endBar, measure.startBar))
		}
		const cellTokens = measure.cells.length > 0 ? measure.cells.map(cellToString) : ['.']
		tokens.push(...cellTokens)
	})
	const last = measures[measures.length - 1]
	if (last?.endBar === 'repeatEnd') tokens.push(':|')
	else if (last?.endBar === 'barEnd') tokens.push('|.')
	else tokens.push('||')
	return tokens.join(' ')
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

			const measures = section.content.measures
			for (let start = 0; start < measures.length; start += MEASURES_PER_LINE) {
				const chunk = measures.slice(start, start + MEASURES_PER_LINE)
				const annotationLine = gridAnnotationLine(chunk)
				if (annotationLine) lines.push(annotationLine)
				lines.push(gridMeasuresToLine(chunk))
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
		case 'noChord': return '/'
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

/**
 * Extract song metadata only (no section structure) — for list/meta use in stores.
 */
export function extractSongMeta(content: string): {
	title: string
	artist: string
	key?: string
	capo?: number
	tempo?: number
	time?: string
} {
	const parsed = parseChordPro(content)
	return {
		title: parsed.title,
		artist: parsed.artist,
		key: parsed.key,
		capo: parsed.capo,
		tempo: parsed.tempo,
		time: parsed.time
	}
}
