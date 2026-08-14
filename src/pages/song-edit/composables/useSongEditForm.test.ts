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

		await save('{title: Test}')
		expect(savedId).toBe(formSong.value.id)
	})

	it('sets content from finalContent parameter on save', async () => {
		const { save, content } = useSongEditForm({
			isNew: ref(true),
			songId: ref(undefined),
			songsStore: mockStore(),
			initialTemplate: '{title: }'
		})

		const finalContent = '{title: My Song}\n{artist: My Band}\n[C]Hello'
		await save(finalContent)
		expect(content.value).toBe(finalContent)
	})

	it('loads an existing song into the form', async () => {
		const { loadSong, title, content } = useSongEditForm({
			isNew: ref(false),
			songId: ref('a'),
			songsStore: {
				currentSong: { id: 'a', title: 'Existing', artist: 'X', content: '{title: Existing}' },
				fetchSong: async () => undefined,
				saveSong: async () => undefined
			},
			initialTemplate: '{title: }'
		})

		await loadSong()
		expect(title.value).toBe('Existing')
		expect(content.value).toBe('{title: Existing}')
	})

	it('sets loadError when fetching an existing song fails', async () => {
		const { loadSong, loadError, title, content } = useSongEditForm({
			isNew: ref(false),
			songId: ref('a'),
			songsStore: {
				currentSong: null,
				fetchSong: async () => { throw new Error('network down') },
				saveSong: async () => undefined
			},
			initialTemplate: '{title: }'
		})

		await loadSong()
		expect(loadError.value).toBe(true)
		expect(title.value).toBe('')
		expect(content.value).toBe('')
	})
})
