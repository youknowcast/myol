import { computed, ref, type Ref } from 'vue'
import type { Song } from '@/lib/chordpro/types'

export interface UseSongEditFormOptions {
	isNew: Ref<boolean>
	songId: Ref<string | undefined>
	songsStore: {
		fetchSong: (id: string, options?: { force?: boolean }) => Promise<void>
		saveSong: (song: Song) => Promise<void>
		currentSong: Song | null
	}
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
	const loadError = ref(false)
	const loadingSong = ref(false)

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
		loadingSong.value = true
		try {
			if (!options.isNew.value && options.songId.value) {
				// 編集は最新のリモート内容から始める (キャッシュを信用しない)
				try {
					await options.songsStore.fetchSong(options.songId.value, { force: true })
				} catch {
					// 取得失敗時は空フォームで保存できる状態にしない
					loadError.value = true
					return
				}
				const current = options.songsStore.currentSong
				if (current?.id !== options.songId.value) {
					loadError.value = true
					return
				}
				title.value = current.title
				artist.value = current.artist
				key.value = current.key || ''
				capo.value = current.capo || 0
				tempo.value = current.tempo || 120
				time.value = current.time || '4/4'
				content.value = current.content
				return
			}

			content.value = options.initialTemplate
		} finally {
			loadingSong.value = false
		}
	}

	async function save(finalContent: string) {
		// ロード完了前・失敗時は保存を拒否する (fail closed)
		if (loadingSong.value || loadError.value) return
		saving.value = true
		try {
			content.value = finalContent
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
		loadError,
		loadingSong,
		formSong,
		loadSong,
		save
	}
}

function generateId(): string {
	return `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
