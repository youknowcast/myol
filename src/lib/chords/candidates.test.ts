import { describe, it, expect } from 'vitest'
import { BASIC_CHORDS, buildChordCandidates } from './candidates'
import type { Section } from '@/lib/chordpro/types'

const sections: Section[] = [
	{
		type: 'grid',
		content: {
			kind: 'grid',
			measures: [
				{ cells: [{ type: 'chord', value: 'G' }, { type: 'chord', value: 'Am' }] },
				{ cells: [{ type: 'chord', value: 'C' }] }
			]
		}
	},
	{
		type: 'verse',
		content: {
			kind: 'lyrics',
			lines: [{ segments: [{ chord: 'C', text: 'x' }, { chord: 'F', text: 'y' }] }]
		}
	}
]

describe('buildChordCandidates', () => {
	it('lists the chords used in the song first, sorted and unique', () => {
		expect(buildChordCandidates(sections).slice(0, 4)).toEqual(['Am', 'C', 'F', 'G'])
	})

	it('fills the rest with the basic set without duplicates', () => {
		const candidates = buildChordCandidates(sections)
		expect(new Set(candidates).size).toBe(candidates.length)
		expect(candidates).toContain('Em')
	})

	it('returns the basic set when the song uses no chords', () => {
		expect(buildChordCandidates([])).toEqual(BASIC_CHORDS)
	})
})
