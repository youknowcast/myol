import { computed, ref, type Ref } from 'vue'
import type { Song } from '@/lib/chordpro/types'
import { generateChordPro, parseChordPro } from '@/lib/chordpro/parser'

export interface UseSongEditFormOptions {
	isNew: Ref<boolean>
	songId: Ref<string | undefined>
	songsStore: { fetchSong: (id: string) => Promise<void>; saveSong: (song: Song) => Promise<void>; currentSong: Song | null }
	initialTemplate: string
}

export function useSongEditForm(options: UseSongEditFormOptions) {
	const title = ref('')
	const artist = ref('')
	const key = ref('')
	const capo = ref(0)
	const tempo = ref(120)
	const time = ref('4/4')
	const content = ref('')
	const saving = ref(false)

	const formSong = computed((): Song => ({
		id: options.songId.value || generateId(),
		title: title.value || 'Untitled',
		artist: artist.value,
		key: key.value,
		capo: capo.value,
		tempo: tempo.value,
		time: time.value,
		content: content.value
	}))

	async function loadSong() {
		if (!options.isNew.value && options.songId.value) {
			await options.songsStore.fetchSong(options.songId.value)
			const current = options.songsStore.currentSong
			if (current) {
				title.value = current.title
				artist.value = current.artist
				key.value = current.key || ''
				capo.value = current.capo || 0
				tempo.value = current.tempo || 120
				time.value = current.time || '4/4'
				content.value = current.content
			}
			return
		}

		content.value = options.initialTemplate
	}

	function applyMetadataToContent() {
		const parsed = parseChordPro(content.value || '')
		parsed.title = title.value || 'Untitled'
		parsed.artist = artist.value
		parsed.key = key.value || undefined
		parsed.capo = Number.isFinite(capo.value) ? capo.value : undefined
		parsed.tempo = Number.isFinite(tempo.value) ? tempo.value : undefined
		parsed.time = time.value || undefined
		content.value = generateChordPro(parsed)
	}

	async function save() {
		saving.value = true
		try {
			applyMetadataToContent()
			const song = formSong.value
			await options.songsStore.saveSong(song)
			return song
		} finally {
			saving.value = false
		}
	}

	return {
		title,
		artist,
		key,
		capo,
		tempo,
		time,
		content,
		saving,
		formSong,
		loadSong,
		save
	}
}

function generateId(): string {
	return `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
