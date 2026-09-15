import type { Section } from '@/lib/chordpro/types'
import { extractUniqueChords } from './dictionary'

export const BASIC_CHORDS = [
	'C', 'G', 'D', 'A', 'E', 'F', 'B',
	'Am', 'Em', 'Dm', 'Bm', 'Gm', 'Cm',
	'C7', 'G7', 'D7', 'A7', 'E7', 'B7',
	'Cmaj7', 'Am7', 'Dm7', 'Em7',
	'Csus4', 'Gsus4', 'Dsus4', 'Asus4',
	'Cadd9', 'Gadd9', 'Dadd9',
	'G/B', 'D/F#', 'C/G'
]

export function buildChordCandidates(sections: Section[]): string[] {
	const used = extractUniqueChords(sections)
	const usedSet = new Set(used)
	return [...used, ...BASIC_CHORDS.filter(chord => !usedSet.has(chord))]
}
