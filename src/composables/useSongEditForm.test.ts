import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useSongEditForm } from './useSongEditForm'

const mockStore = () => ({
	currentSong: null,
	fetchSong: async () => undefined,
	saveSong: async () => undefined
})

describe('useSongEditForm', () => {
	it('builds form song with defaults', () => {
		const { formSong } = useSongEditForm({
			isNew: ref(true),
			songId: ref(undefined),
			songsStore: mockStore(),
			initialTemplate: '{title: }'
		})

		expect(formSong.value.title).toBe('Untitled')
		expect(formSong.value.content).toBe('')
	})

	it('loads template for new songs', async () => {
		const contentTemplate = '{title: Template}'
		const { loadSong, content } = useSongEditForm({
			isNew: ref(true),
			songId: ref(undefined),
			songsStore: mockStore(),
			initialTemplate: contentTemplate
		})

		await loadSong()
		expect(content.value).toBe(contentTemplate)
	})

	it('saves using provided store', async () => {
		let savedId: string | null = null
		const { save, formSong } = useSongEditForm({
			isNew: ref(true),
			songId: ref(undefined),
			songsStore: {
				...mockStore(),
				saveSong: async (song) => {
					savedId = song.id
				}
			},
			initialTemplate: '{title: }'
		})

		await save()
		expect(savedId).toBe(formSong.value.id)
	})

	it('writes metadata into content on save', async () => {
		let savedContent: string | null = null
		const { save, title, artist, key, capo, tempo, time, content } = useSongEditForm({
			isNew: ref(true),
			songId: ref(undefined),
			songsStore: {
				...mockStore(),
				saveSong: async (song) => {
					savedContent = song.content
				}
			},
			initialTemplate: '{title: }'
		})

		title.value = 'My Song'
		artist.value = 'My Band'
		key.value = 'D'
		capo.value = 2
		tempo.value = 90
		time.value = '6/8'
		content.value = '{start_of_verse}\n[C]Hello\n{end_of_verse}'

		await save()
		expect(savedContent).toContain('{title: My Song}')
		expect(savedContent).toContain('{artist: My Band}')
		expect(savedContent).toContain('{key: D}')
		expect(savedContent).toContain('{capo: 2}')
		expect(savedContent).toContain('{tempo: 90}')
		expect(savedContent).toContain('{time: 6/8}')
	})
})
