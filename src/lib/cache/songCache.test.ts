import { describe, it, expect, beforeEach } from 'vitest'
import {
	getAllCachedSongs,
	getCachedSong,
	putCachedSongs,
	removeCachedSongs,
	clearSongCache
} from './songCache'

describe('songCache', () => {
	beforeEach(async () => {
		await clearSongCache()
	})

	it('stores and retrieves songs', async () => {
		await putCachedSongs([
			{ key: 'songs/foo.cho', content: '{title: Foo}', fetchedAt: 1000 }
		])

		const song = await getCachedSong('songs/foo.cho')
		expect(song?.content).toBe('{title: Foo}')
		expect(song?.fetchedAt).toBe(1000)
	})

	it('returns undefined for a missing song', async () => {
		expect(await getCachedSong('songs/missing.cho')).toBeUndefined()
	})

	it('returns all stored songs', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: '{title: A}', fetchedAt: 1 },
			{ key: 'songs/b.cho', content: '{title: B}', lastModified: 't1', fetchedAt: 2 }
		])

		const all = await getAllCachedSongs()
		expect(all).toHaveLength(2)
		expect(all.find(s => s.key === 'songs/b.cho')?.lastModified).toBe('t1')
	})

	it('overwrites an existing entry on put', async () => {
		await putCachedSongs([{ key: 'songs/a.cho', content: 'old', fetchedAt: 1 }])
		await putCachedSongs([{ key: 'songs/a.cho', content: 'new', fetchedAt: 2 }])

		const song = await getCachedSong('songs/a.cho')
		expect(song?.content).toBe('new')
		expect(song?.fetchedAt).toBe(2)
	})

	it('removes songs by key', async () => {
		await putCachedSongs([
			{ key: 'songs/a.cho', content: 'A', fetchedAt: 1 },
			{ key: 'songs/b.cho', content: 'B', fetchedAt: 1 }
		])

		await removeCachedSongs(['songs/a.cho', 'songs/missing.cho'])

		expect(await getCachedSong('songs/a.cho')).toBeUndefined()
		expect(await getCachedSong('songs/b.cho')).not.toBeUndefined()
	})

	it('clears all songs', async () => {
		await putCachedSongs([{ key: 'songs/a.cho', content: 'A', fetchedAt: 1 }])
		await clearSongCache()

		expect(await getAllCachedSongs()).toEqual([])
	})
})
