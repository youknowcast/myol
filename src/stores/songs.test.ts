import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSongsStore } from './songs'

vi.mock('@/lib/s3/client', () => ({
	isApiConfigured: () => false,
	listSongs: vi.fn(),
	getSongContent: vi.fn(),
	saveSongContent: vi.fn(),
	deleteSong: vi.fn()
}))

describe('songs store (local mode)', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('saves and fetches song locally', async () => {
		const store = useSongsStore()
		await store.saveSong({
			id: 'local-song',
			title: 'Local',
			artist: 'Test',
			content: '{title: Local}',
			tempo: 120,
			time: '4/4'
		})

		await store.fetchSong('local-song')
		expect(store.currentSong?.title).toBe('Local')
		expect(store.currentSong?.content).toBe('{title: Local}')
	})

	it('updates song list after save', async () => {
		const store = useSongsStore()
		await store.saveSong({
			id: 'listed-song',
			title: 'Listed',
			artist: 'Tester',
			content: '{title: Listed}'
		})

		await store.fetchSongs()
		const hasSong = store.songs.some(song => song.id === 'listed-song')
		expect(hasSong).toBe(true)
	})
})
