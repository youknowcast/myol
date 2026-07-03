import type { GridCell, Measure } from './types'

export function cellGlyph(cell: GridCell): string {
	switch (cell.type) {
		case 'noChord': return '/'
		case 'empty': return '·'
		case 'repeat': return cell.value || '%'
		case 'chord': return cell.value || ''
	}
}

export function cellKind(cell: GridCell): 'chord' | 'empty' | 'repeat' {
	switch (cell.type) {
		case 'chord': return 'chord'
		case 'repeat': return 'repeat'
		default: return 'empty'
	}
}

export function boundaryGlyph(
	endBar: Measure['endBar'],
	startBar: Measure['startBar'],
	fallback: string
): string {
	if (endBar === 'repeatEnd' && startBar === 'repeatStart') return ':║:'
	if (endBar === 'barEnd') return startBar === 'repeatStart' ? '║. ║:' : '║.'
	if (endBar === 'repeatEnd') return ':║'
	if (startBar === 'repeatStart') return '║:'
	return fallback
}

export function gridBarGlyphs(measures: Measure[]): string[] {
	const glyphs: string[] = []
	for (let i = 0; i <= measures.length; i += 1) {
		const endBar = i > 0 ? measures[i - 1]?.endBar : undefined
		const startBar = i < measures.length ? measures[i]?.startBar : undefined
		const fallback = i === 0 || i === measures.length ? '║' : '│'
		glyphs.push(boundaryGlyph(endBar, startBar, fallback))
	}
	return glyphs
}
