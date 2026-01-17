/**
 * Chord dictionary for guitar
 * Format: [E, A, D, G, B, e] where:
 *   -1 = muted (x)
 *   0  = open
 *   1+ = fret number
 */

import type { Section, LyricsSection, GridSection } from '@/lib/chordpro/types'

export interface ChordDiagram {
	name: string
	frets: number[]
	fingers?: number[]
	barré?: number
	baseFret?: number
}

export const chordDictionary: Record<string, ChordDiagram> = {
	// Major chords
	'C': { name: 'C', frets: [-1, 3, 2, 0, 1, 0] },
	'D': { name: 'D', frets: [-1, -1, 0, 2, 3, 2] },
	'E': { name: 'E', frets: [0, 2, 2, 1, 0, 0] },
	'F': { name: 'F', frets: [1, 3, 3, 2, 1, 1], barré: 1 },
	'G': { name: 'G', frets: [3, 2, 0, 0, 0, 3] },
	'A': { name: 'A', frets: [-1, 0, 2, 2, 2, 0] },
	'B': { name: 'B', frets: [-1, 2, 4, 4, 4, 2], barré: 2, baseFret: 2 },

	// Minor chords
	'Cm': { name: 'Cm', frets: [-1, 3, 5, 5, 4, 3], barré: 3, baseFret: 3 },
	'Dm': { name: 'Dm', frets: [-1, -1, 0, 2, 3, 1] },
	'Em': { name: 'Em', frets: [0, 2, 2, 0, 0, 0] },
	'Fm': { name: 'Fm', frets: [1, 3, 3, 1, 1, 1], barré: 1 },
	'Gm': { name: 'Gm', frets: [3, 5, 5, 3, 3, 3], barré: 3, baseFret: 3 },
	'Am': { name: 'Am', frets: [-1, 0, 2, 2, 1, 0] },
	'Bm': { name: 'Bm', frets: [-1, 2, 4, 4, 3, 2], barré: 2, baseFret: 2 },

	// 7th chords
	'C7': { name: 'C7', frets: [-1, 3, 2, 3, 1, 0] },
	'D7': { name: 'D7', frets: [-1, -1, 0, 2, 1, 2] },
	'E7': { name: 'E7', frets: [0, 2, 0, 1, 0, 0] },
	'F7': { name: 'F7', frets: [1, 3, 1, 2, 1, 1], barré: 1 },
	'G7': { name: 'G7', frets: [3, 2, 0, 0, 0, 1] },
	'A7': { name: 'A7', frets: [-1, 0, 2, 0, 2, 0] },
	'B7': { name: 'B7', frets: [-1, 2, 1, 2, 0, 2] },

	// Major 7th
	'Cmaj7': { name: 'Cmaj7', frets: [-1, 3, 2, 0, 0, 0] },
	'Dmaj7': { name: 'Dmaj7', frets: [-1, -1, 0, 2, 2, 2] },
	'Emaj7': { name: 'Emaj7', frets: [0, 2, 1, 1, 0, 0] },
	'Fmaj7': { name: 'Fmaj7', frets: [1, -1, 2, 2, 1, 0] },
	'Gmaj7': { name: 'Gmaj7', frets: [3, 2, 0, 0, 0, 2] },
	'Amaj7': { name: 'Amaj7', frets: [-1, 0, 2, 1, 2, 0] },

	// Minor 7th
	'Cm7': { name: 'Cm7', frets: [-1, 3, 5, 3, 4, 3], barré: 3, baseFret: 3 },
	'Dm7': { name: 'Dm7', frets: [-1, -1, 0, 2, 1, 1] },
	'Em7': { name: 'Em7', frets: [0, 2, 0, 0, 0, 0] },
	'Fm7': { name: 'Fm7', frets: [1, 3, 1, 1, 1, 1], barré: 1 },
	'Gm7': { name: 'Gm7', frets: [3, 5, 3, 3, 3, 3], barré: 3, baseFret: 3 },
	'Am7': { name: 'Am7', frets: [-1, 0, 2, 0, 1, 0] },
	'Bm7': { name: 'Bm7', frets: [-1, 2, 4, 2, 3, 2], barré: 2, baseFret: 2 },

	// Sus chords
	'Csus4': { name: 'Csus4', frets: [-1, 3, 3, 0, 1, 1] },
	'Dsus4': { name: 'Dsus4', frets: [-1, -1, 0, 2, 3, 3] },
	'Esus4': { name: 'Esus4', frets: [0, 2, 2, 2, 0, 0] },
	'Gsus4': { name: 'Gsus4', frets: [3, 3, 0, 0, 1, 3] },
	'Asus4': { name: 'Asus4', frets: [-1, 0, 2, 2, 3, 0] },

	'Dsus2': { name: 'Dsus2', frets: [-1, -1, 0, 2, 3, 0] },
	'Asus2': { name: 'Asus2', frets: [-1, 0, 2, 2, 0, 0] },

	// Add9 chords
	'Cadd9': { name: 'Cadd9', frets: [-1, 3, 2, 0, 3, 0] },
	'Dadd9': { name: 'Dadd9', frets: [-1, -1, 0, 2, 3, 0] },
	'Eadd9': { name: 'Eadd9', frets: [0, 2, 2, 1, 0, 2] },
	'Gadd9': { name: 'Gadd9', frets: [3, 0, 0, 0, 0, 3] },

	// Slash chords (common ones)
	'G/B': { name: 'G/B', frets: [-1, 2, 0, 0, 0, 3] },
	'C/G': { name: 'C/G', frets: [3, 3, 2, 0, 1, 0] },
	'D/F#': { name: 'D/F#', frets: [2, -1, 0, 2, 3, 2] },
	'Am/G': { name: 'Am/G', frets: [3, 0, 2, 2, 1, 0] },
	'Em/D': { name: 'Em/D', frets: [-1, -1, 0, 0, 0, 0] },
}

/**
 * Get chord diagram by name
 */
export function getChordDiagram(name: string): ChordDiagram | undefined {
	// Normalize chord name
	const normalized = name.replace(/\s+/g, '')

	// Try exact match first
	if (chordDictionary[normalized]) {
		return chordDictionary[normalized]
	}

	// Try without bass note for slash chords
	const slashIndex = normalized.indexOf('/')
	if (slashIndex > 0) {
		const baseChord = normalized.slice(0, slashIndex)
		if (chordDictionary[baseChord]) {
			return { ...chordDictionary[baseChord], name: normalized }
		}
	}

	return undefined
}

/**
 * Extract unique chords from parsed song sections
 */
export function extractUniqueChords(sections: Section[]): string[] {
	const chords = new Set<string>()

	for (const section of sections) {
		if (section.content.kind === 'lyrics') {
			const lyricsContent = section.content as LyricsSection
			for (const line of lyricsContent.lines) {
				for (const segment of line.segments) {
					if (segment.chord) {
						chords.add(segment.chord)
					}
				}
			}
		} else if (section.content.kind === 'grid') {
			const gridContent = section.content as GridSection
			const sourceMeasures = gridContent.measures
				? gridContent.measures
				: gridContent.rows.map(row => ({ cells: row.cells }))

			for (const measure of sourceMeasures) {
				for (const cell of measure.cells) {
					if (cell.type === 'chord' && cell.value) {
						const cellChords = cell.value.split('~')
						for (const c of cellChords) {
							if (c && c !== '/' && c !== '.') {
								chords.add(c)
							}
						}
					}
				}
			}
		}
	}

	return Array.from(chords).sort()
}

