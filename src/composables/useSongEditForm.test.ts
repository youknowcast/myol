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
})
