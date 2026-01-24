import { describe, it, expect } from 'vitest'
import { computed } from 'vue'
import { useSongChords } from './useSongChords'
import type { ParsedSong } from '@/lib/chordpro/types'

describe('useSongChords', () => {
	it('returns empty when no song', () => {
		const parsedSong = computed<ParsedSong | null>(() => null)
		const { uniqueChords } = useSongChords(parsedSong)

		expect(uniqueChords.value).toEqual([])
	})

	it('extracts chords from sections', () => {
		const parsedSong = computed<ParsedSong>(() => ({
			title: 'Test',
			artist: '',
			sections: [
				{
					type: 'verse',
					content: {
						kind: 'lyrics',
						lines: [
							{ segments: [{ chord: 'C', text: 'Hello' }] }
						]
					}
				}
			]
		}))
		const { uniqueChords } = useSongChords(parsedSong)

		expect(uniqueChords.value).toEqual(['C'])
	})
})
