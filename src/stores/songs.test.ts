import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSongsStore } from './songs'
import {
	putCachedSongs,
	getAllCachedSongs,
	clearSongCache
} from '@/lib/cache/songCache'

const mocks = vi.hoisted(() => ({
	isApiConfigured: vi.fn(() => false),
	listSongs: vi.fn(),
	getSongContent: vi.fn(),
	saveSongContent: vi.fn(),
	deleteSong: vi.fn()
}))

vi.mock('@/lib/s3/client', () => mocks)

const BASE_TIME = new Date('2026-01-01T00:00:00Z')
const TTL_MS = 5 * 60 * 1000

const contentA = '{title: Song A}\n{artist: Artist A}'
const contentB = '{title: Song B}'

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

describe('songs store (s3 + cache mode)', () => {
	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(BASE_TIME)
		mocks.isApiConfigured.mockReturnValue(true)
		mocks.listSongs.mockReset()
		mocks.getSongContent.mockReset()
		mocks.saveSongContent.mockReset()
		mocks.deleteSong.mockReset()
		await clearSongCache()
		setActivePinia(createPinia())
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	function staleFetchedAt(): number {
		return Date.now() - TTL_MS - 60 * 1000
	}

	it('serves the cached list and does not refetch unchanged songs', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: Date.now() }
		])
		mocks.listSongs.mockResolvedValue([
			{ id: 'a', key: 'songs/a.cho', lastModified: 't1' }
		])

		const store = useSongsStore()
		await store.fetchSongs()

		expect(store.songs).toHaveLength(1)
		expect(store.songs[0]).toMatchObject({ id: 'a', title: 'Song A', artist: 'Artist A' })
		expect(mocks.listSongs).toHaveBeenCalledTimes(1)
		expect(mocks.getSongContent).not.toHaveBeenCalled()
	})

	it('refetches only songs whose lastModified changed', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: staleFetchedAt() },
			{ key: 'songs/b.cho', content: contentB, lastModified: 't1', fetchedAt: staleFetchedAt() }
		])
		mocks.listSongs.mockResolvedValue([
			{ id: 'a', key: 'songs/a.cho', lastModified: 't1' },
			{ id: 'b', key: 'songs/b.cho', lastModified: 't2' }
		])
		mocks.getSongContent.mockResolvedValue('{title: Song B v2}')

		const store = useSongsStore()
		await store.fetchSongs()

		expect(mocks.getSongContent).toHaveBeenCalledTimes(1)
		expect(mocks.getSongContent).toHaveBeenCalledWith('songs/b.cho')
		const songB = store.songs.find(s => s.id === 'b')
		expect(songB?.title).toBe('Song B v2')
		const songA = store.songs.find(s => s.id === 'a')
		expect(songA?.title).toBe('Song A')
	})

	it('picks up a new song registered on another device', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: staleFetchedAt() }
		])
		mocks.listSongs.mockResolvedValue([
			{ id: 'a', key: 'songs/a.cho', lastModified: 't1' },
			{ id: 'c', key: 'songs/c.cho', lastModified: 't9' }
		])
		mocks.getSongContent.mockResolvedValue('{title: Song C}')

		const store = useSongsStore()
		await store.fetchSongs()

		expect(store.songs.map(s => s.id)).toEqual(['a', 'c'])
		expect(store.songs.find(s => s.id === 'c')?.title).toBe('Song C')
		const cached = await getAllCachedSongs()
		expect(cached.find(c => c.key === 'songs/c.cho')?.content).toBe('{title: Song C}')
	})

	it('drops songs deleted on the remote from cache and list', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: staleFetchedAt() },
			{ key: 'songs/b.cho', content: contentB, lastModified: 't1', fetchedAt: staleFetchedAt() }
		])
		mocks.listSongs.mockResolvedValue([
			{ id: 'a', key: 'songs/a.cho', lastModified: 't1' }
		])

		const store = useSongsStore()
		await store.fetchSongs()

		expect(store.songs.map(s => s.id)).toEqual(['a'])
		expect((await getAllCachedSongs()).map(c => c.key)).toEqual(['songs/a.cho'])
	})

	it('does not refetch a recently fetched song and keeps the old lastModified', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: Date.now() }
		])
		mocks.listSongs.mockResolvedValue([
			{ id: 'a', key: 'songs/a.cho', lastModified: 't2' }
		])

		const store = useSongsStore()
		await store.fetchSongs()

		expect(mocks.getSongContent).not.toHaveBeenCalled()
		expect(store.songs[0]!.title).toBe('Song A')
		const cached = await getAllCachedSongs()
		// lastModified を新しい値に進めない: TTL 切れ後の差分で再検出させる
		expect(cached[0]!.lastModified).toBe('t1')
	})

	it('refetches a throttled song once the TTL expires and lastModified differs', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: Date.now() }
		])
		mocks.listSongs.mockResolvedValue([
			{ id: 'a', key: 'songs/a.cho', lastModified: 't2' }
		])

		const store = useSongsStore()
		await store.fetchSongs()
		expect(mocks.getSongContent).not.toHaveBeenCalled()

		vi.advanceTimersByTime(TTL_MS + 60 * 1000)
		mocks.getSongContent.mockResolvedValue('{title: Song A v2}')
		await store.fetchSongs()

		expect(mocks.getSongContent).toHaveBeenCalledTimes(1)
		expect(store.songs[0]!.title).toBe('Song A v2')
		const cached = await getAllCachedSongs()
		expect(cached[0]!.lastModified).toBe('t2')
	})

	it('keeps the cached list when S3 is unreachable', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: staleFetchedAt() }
		])
		mocks.listSongs.mockRejectedValue(new Error('network down'))

		const store = useSongsStore()
		await store.fetchSongs()

		expect(store.songs).toHaveLength(1)
		expect(store.songs[0]!.title).toBe('Song A')
		expect(store.error).toBeNull()
	})

	it('falls back to local data when S3 is unreachable and no cache exists', async () => {
		mocks.listSongs.mockRejectedValue(new Error('network down'))

		const store = useSongsStore()
		await store.fetchSongs()

		expect(store.error).toBe('network down')
		expect(store.songs.some(s => s.id === 'amazing-grace')).toBe(true)
	})

	it('serves a fresh cached song without S3 access', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: Date.now() }
		])

		const store = useSongsStore()
		await store.fetchSong('a')

		expect(store.currentSong?.title).toBe('Song A')
		expect(store.currentSong?.content).toBe(contentA)
		expect(mocks.getSongContent).not.toHaveBeenCalled()
	})

	it('revalidates a stale cached song in the background', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: staleFetchedAt() }
		])
		mocks.getSongContent.mockResolvedValue('{title: Song A v2}')

		const store = useSongsStore()
		await store.fetchSong('a')

		expect(mocks.getSongContent).toHaveBeenCalledTimes(1)
		expect(store.currentSong?.content).toBe('{title: Song A v2}')
	})

	it('does not let a stale revalidation overwrite a newer navigation', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: staleFetchedAt() }
		])
		let resolveA: (value: string) => void = () => {}
		mocks.getSongContent.mockImplementation(async (key: string) => {
			if (key === 'a') {
				return await new Promise<string>(res => { resolveA = res })
			}
			return '{title: Song B}'
		})

		const store = useSongsStore()
		const pA = store.fetchSong('a')
		// a の再検証が進行中に b へ遷移
		await store.fetchSong('b')
		resolveA('{title: Song A v2}')
		await pA

		expect(store.currentSong?.id).toBe('b')
		expect(store.currentSong?.content).toBe('{title: Song B}')
	})

	it('keeps loading true while a newer fetch is pending when an older one settles', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: staleFetchedAt() }
		])
		let resolveA: (value: string) => void = () => {}
		let resolveB: (value: string) => void = () => {}
		mocks.getSongContent.mockImplementation(async (key: string) => {
			if (key === 'a') {
				return await new Promise<string>(res => { resolveA = res })
			}
			return await new Promise<string>(res => { resolveB = res })
		})

		const store = useSongsStore()
		const pA = store.fetchSong('a')
		// a の再検証が開始されるのを待ってから b へ遷移
		await vi.waitFor(() => {
			expect(mocks.getSongContent).toHaveBeenCalledWith('a')
		})
		const pB = store.fetchSong('b')
		resolveA('{title: Song A v2}')
		await pA
		// 古い再検証の完了では loading を落とさない
		expect(store.loading).toBe(true)
		await vi.waitFor(() => {
			expect(mocks.getSongContent).toHaveBeenCalledWith('b')
		})
		resolveB('{title: Song B}')
		await pB
		expect(store.loading).toBe(false)
		expect(store.currentSong?.id).toBe('b')
	})

	it('does not let a stale failed fetch set the error', async () => {
		mocks.getSongContent.mockImplementation(async (key: string) => {
			if (key === 'a') throw new Error('network down')
			return '{title: Song B}'
		})

		const store = useSongsStore()
		const pA = store.fetchSong('a')
		const pB = store.fetchSong('b')
		await pA
		await pB

		expect(store.error).toBeNull()
		expect(store.currentSong?.id).toBe('b')
	})

	it('caches an empty song content instead of treating it as a failure', async () => {
		mocks.listSongs.mockResolvedValue([{ id: 'empty', key: 'songs/empty.cho', lastModified: 't1' }])
		mocks.getSongContent.mockResolvedValue('')

		const store = useSongsStore()
		await store.fetchSongs()
		await store.fetchSongs()

		expect(mocks.getSongContent).toHaveBeenCalledTimes(1)
		const cached = await getAllCachedSongs()
		expect(cached[0]?.content).toBe('')
	})

	it('keeps lastModified when revalidating a stale cached song', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: staleFetchedAt() }
		])
		mocks.getSongContent.mockResolvedValue('{title: Song A v2}')

		const store = useSongsStore()
		await store.fetchSong('a')

		const cached = await getAllCachedSongs()
		expect(cached[0]!.lastModified).toBe('t1')
	})

	it('throws when a forced fetch fails', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: Date.now() }
		])
		mocks.getSongContent.mockRejectedValue(new Error('network down'))

		const store = useSongsStore()
		await expect(store.fetchSong('a', { force: true })).rejects.toThrow('network down')
		expect(store.currentSong).toBeNull()
	})

	it('falls back to local data when a non-forced fetch fails', async () => {
		mocks.getSongContent.mockRejectedValue(new Error('network down'))

		const store = useSongsStore()
		await store.fetchSong('a')

		expect(store.error).toBe('network down')
		expect(store.currentSong).toBeNull()
	})

	it('does not resurrect a song deleted during list reconciliation', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: staleFetchedAt() },
			{ key: 'songs/b.cho', content: contentB, lastModified: 't1', fetchedAt: staleFetchedAt() }
		])
		let resolveList: (value: { id: string; key: string; lastModified: string }[]) => void = () => {}
		mocks.listSongs.mockImplementation(() => new Promise(res => { resolveList = res }))
		mocks.deleteSong.mockResolvedValue(undefined)
		mocks.getSongContent.mockResolvedValue(contentA)

		const store = useSongsStore()
		const p = store.fetchSongs()
		// リコンサイル中に削除
		await store.removeSong('a')
		resolveList([
			{ id: 'a', key: 'songs/a.cho', lastModified: 't1' },
			{ id: 'b', key: 'songs/b.cho', lastModified: 't1' }
		])
		await p

		expect(store.songs.map(s => s.id)).toEqual(['b'])
	})

	it('force-fetches even when a fresh cache entry exists', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, lastModified: 't1', fetchedAt: Date.now() }
		])
		mocks.getSongContent.mockResolvedValue('{title: Song A v2}')

		const store = useSongsStore()
		await store.fetchSong('a', { force: true })

		expect(mocks.getSongContent).toHaveBeenCalledTimes(1)
		expect(store.currentSong?.content).toBe('{title: Song A v2}')
		const cached = await getAllCachedSongs()
		expect(cached[0]!.lastModified).toBe('t1')
	})

	it('fetches and caches a song on cache miss, then reuses the cache', async () => {
		mocks.getSongContent.mockResolvedValue(contentA)

		const store = useSongsStore()
		await store.fetchSong('a')
		await store.fetchSong('a')

		expect(store.currentSong?.title).toBe('Song A')
		expect(mocks.getSongContent).toHaveBeenCalledTimes(1)
	})

	it('updates the cache after saving a song', async () => {
		mocks.saveSongContent.mockResolvedValue(undefined)
		mocks.listSongs.mockResolvedValue([
			{ id: 'new', key: 'songs/new.cho', lastModified: 't1' }
		])

		const store = useSongsStore()
		await store.saveSong({ id: 'new', title: 'New', artist: '', content: '{title: New}' })
		await store.fetchSongs()

		expect(mocks.getSongContent).not.toHaveBeenCalled()
		expect(store.songs.find(s => s.id === 'new')?.title).toBe('New')
	})

	it('removes a song from the cache after deletion', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: contentA, fetchedAt: Date.now() }
		])
		mocks.deleteSong.mockResolvedValue(undefined)

		const store = useSongsStore()
		await store.removeSong('a')

		expect(await getAllCachedSongs()).toEqual([])
	})
})
