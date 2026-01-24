import { computed, type ComputedRef } from 'vue'
import { extractUniqueChords } from '@/lib/chords/dictionary'
import type { ParsedSong } from '@/lib/chordpro/types'

export function useSongChords(parsedSong: ComputedRef<ParsedSong | null>) {
	const uniqueChords = computed(() => {
		if (!parsedSong.value) return []
		return extractUniqueChords(parsedSong.value.sections)
	})

	return {
		uniqueChords
	}
}
