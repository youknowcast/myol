import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Song, SongMeta } from '@/lib/chordpro/types'
import { extractSongMeta } from '@/lib/chordpro/parser'
import * as s3Api from '@/lib/s3/client'
import * as songCache from '@/lib/cache/songCache'
import type { CachedSong } from '@/lib/cache/songCache'

const CACHE_TTL_MS = 5 * 60 * 1000

function isFresh(fetchedAt: number): boolean {
	return Date.now() - fetchedAt < CACHE_TTL_MS
}

/**
 * キャッシュキーを正規化する (songs/foo.cho 形式)
 */
function canonicalKey(raw: string): string {
	const trimmed = raw.trim().replace(/^\/+/, '')
	if (trimmed.startsWith('songs/')) {
		return trimmed
	}
	return `songs/${trimmed}${trimmed.endsWith('.cho') ? '' : '.cho'}`
}

function idFromKey(key: string): string {
	return key.replace(/^songs\//, '').replace(/\.cho$/, '')
}

function toSongMeta(content: string, fallbackId: string): SongMeta {
	const meta = extractSongMeta(content)
	return {
		id: fallbackId,
		title: meta.title || fallbackId,
		artist: meta.artist || '',
		key: meta.key
	}
}

function toLocalMeta(song: Song): SongMeta {
	return {
		id: song.id,
		title: song.title,
		artist: song.artist,
		key: song.key
	}
}

export const useSongsStore = defineStore('songs', () => {
	const songs = ref<SongMeta[]>([])
	const currentSong = ref<Song | null>(null)
	const loading = ref(false)
	const error = ref<string | null>(null)

	const sortedSongs = computed(() => {
		return [...songs.value].sort((a, b) => a.title.localeCompare(b.title, 'ja'))
	})

	// サンプル曲データ (API未設定時のフォールバック)
	const sampleSongs: Record<string, Song> = {
		'amazing-grace': {
			id: 'amazing-grace',
			title: 'Amazing Grace',
			artist: 'Traditional',
			key: 'G',
			capo: 0,
			tempo: 80,
			time: '3/4',
			content: `{title: Amazing Grace}
{artist: Traditional}
{key: G}
{tempo: 80}
{time: 3/4}

{start_of_grid label="Intro" shape="4x4"}
|| G . . | G . . | G . . | G/B . . |
| C . . | C . . | G . . | G . . ||
{end_of_grid}

{start_of_verse label="Verse 1"}
[G]Amazing [G/B]grace how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me
[G]I once was [G/B]lost but [C]now am [G]found
Was [G]blind but [D]now I [G]see
{end_of_verse}

{start_of_verse label="Verse 2"}
[G]'Twas grace that [G/B]taught my [C]heart to [G]fear
And [G]grace my [Em]fears re[D]lieved
[G]How precious [G/B]did that [C]grace ap[G]pear
The [G]hour I [D]first be[G]believed
{end_of_verse}

{start_of_verse label="Verse 3"}
[G]Through many [G/B]dangers [C]toils and [G]snares
I [G]have al[Em]ready [D]come
[G]'Tis grace hath [G/B]brought me [C]safe thus [G]far
And [G]grace will [D]lead me [G]home
{end_of_verse}

{start_of_verse label="Verse 4"}
[G]When we've been [G/B]there ten [C]thousand [G]years
Bright [G]shining [Em]as the [D]sun
[G]We've no less [G/B]days to [C]sing God's [G]praise
Than [G]when we'd [D]first be[G]gun
{end_of_verse}

{start_of_grid label="Chord Progression (Full)" shape="4x4"}
|| G . . | G/B . . | C . . | G . . |
| G . . | Em . . | D . . | D . . |
| G . . | G/B . . | C . . | G . . |
| G . . | D . . | G . . | G . . |
| G . . | G/B . . | C . . | G . . |
| G . . | Em . . | D . . | D . . |
| G . . | G/B . . | C . . | G . . |
| G . . | D . . | G . . | G . . ||
{end_of_grid}`
		}
	}

	const localSongs = ref<Record<string, Song>>({ ...sampleSongs })

	function upsertSongMeta(song: Song) {
		const meta: SongMeta = {
			id: song.id,
			title: song.title,
			artist: song.artist,
			key: song.key
		}
		const index = songs.value.findIndex(item => item.id === song.id)
		if (index >= 0) {
			songs.value.splice(index, 1, meta)
		} else {
			songs.value.push(meta)
		}
	}

	function setCurrentSong(id: string, content: string) {
		const meta = extractSongMeta(content)
		currentSong.value = {
			id,
			title: meta.title || id,
			artist: meta.artist || '',
			key: meta.key,
			capo: meta.capo,
			tempo: meta.tempo,
			time: meta.time,
			content
		}
	}

	function localSongMetas(): SongMeta[] {
		return Object.values(localSongs.value).map(toLocalMeta)
	}

	async function fetchSongs() {
		loading.value = true
		error.value = null
		try {
			if (!s3Api.isApiConfigured()) {
				// API 未設定時はローカルデータを使用
				songs.value = localSongMetas()
				return
			}

			// キャッシュがあれば即表示
			let cached: CachedSong[] = []
			try {
				cached = await songCache.getAllCachedSongs()
			} catch {
				// IndexedDB が使えない場合はキャッシュなしで続行
			}
			if (cached.length > 0) {
				songs.value = cached.map(c => toSongMeta(c.content, idFromKey(c.key)))
				loading.value = false
			}

			// バックグラウンドで S3 と差分検証
			let s3Songs
			try {
				s3Songs = await s3Api.listSongs()
			} catch (e) {
				if (cached.length === 0) {
					error.value = e instanceof Error ? e.message : '曲の取得に失敗しました'
					// エラー時もローカルデータを表示
					songs.value = localSongMetas()
				}
				return
			}

			const cacheByKey = new Map(cached.map(c => [c.key, c]))
			const now = Date.now()
			const metaList: SongMeta[] = []
			const toPersist: CachedSong[] = []

			for (const s of s3Songs) {
				const entry = cacheByKey.get(s.key)
				let content: string | null = null

				if (entry && entry.lastModified === s.lastModified) {
					// 変更なし
					content = entry.content
				} else if (entry && isFresh(entry.fetchedAt)) {
					// 直近に取得済み (throttle)。lastModified だけ更新
					content = entry.content
					toPersist.push({ ...entry, lastModified: s.lastModified })
				} else {
					try {
						content = await s3Api.getSongContent(s.key)
						toPersist.push({ key: s.key, content, lastModified: s.lastModified, fetchedAt: now })
					} catch {
						// 取得失敗時はキャッシュがあれば維持
						content = entry?.content ?? null
					}
				}

				metaList.push(content ? toSongMeta(content, s.id) : { id: s.id, title: s.id, artist: '' })
			}

			// リモートで削除された曲をキャッシュから除去
			const removedKeys = cached
				.filter(c => !s3Songs.some(s => s.key === c.key))
				.map(c => c.key)

			try {
				await songCache.putCachedSongs(toPersist)
				await songCache.removeCachedSongs(removedKeys)
			} catch {
				// キャッシュ書き込み失敗は致命的ではない
			}

			songs.value = metaList
		} finally {
			loading.value = false
		}
	}

	async function fetchSong(id: string) {
		loading.value = true
		error.value = null
		try {
			if (!s3Api.isApiConfigured()) {
				// API 未設定時はローカルデータを使用
				currentSong.value = localSongs.value[id] ?? localSongs.value['amazing-grace'] ?? null
				return
			}

			const key = canonicalKey(id)

			let cached: CachedSong | undefined
			try {
				cached = await songCache.getCachedSong(key)
			} catch {
				cached = undefined
			}

			if (cached) {
				// キャッシュで即表示
				setCurrentSong(id, cached.content)
				loading.value = false

				if (!isFresh(cached.fetchedAt)) {
					// 期限切れならバックグラウンドで再検証
					try {
						const content = await s3Api.getSongContent(id)
						setCurrentSong(id, content)
						await songCache.putCachedSongs([{ key, content, fetchedAt: Date.now() }])
					} catch {
						// キャッシュ表示を維持
					}
				}
				return
			}

			// キャッシュミス → S3 から取得して保存
			const content = await s3Api.getSongContent(id)
			setCurrentSong(id, content)
			try {
				await songCache.putCachedSongs([{ key, content, fetchedAt: Date.now() }])
			} catch {
				// キャッシュ保存失敗は致命的ではない
			}
		} catch (e) {
			error.value = e instanceof Error ? e.message : '曲の取得に失敗しました'
			// エラー時はローカルデータを試す
			currentSong.value = localSongs.value[id] ?? null
		} finally {
			loading.value = false
		}
	}

	async function saveSong(song: Song) {
		loading.value = true
		error.value = null
		try {
			if (s3Api.isApiConfigured()) {
				// S3 に保存
				await s3Api.saveSongContent(song.id, song.content)
				// キャッシュを即時更新
				try {
					await songCache.putCachedSongs([
						{ key: canonicalKey(song.id), content: song.content, fetchedAt: Date.now() }
					])
				} catch {
					// キャッシュ書き込み失敗は致命的ではない
				}
			} else {
				// API 未設定時はローカルデータを更新
				localSongs.value = {
					...localSongs.value,
					[song.id]: song
				}
			}

			currentSong.value = song
			upsertSongMeta(song)
		} catch (e) {
			error.value = e instanceof Error ? e.message : '曲の保存に失敗しました'
			throw e
		} finally {
			loading.value = false
		}
	}

	async function removeSong(id: string) {
		loading.value = true
		error.value = null
		try {
			if (s3Api.isApiConfigured()) {
				await s3Api.deleteSong(id)
				// キャッシュからも削除
				try {
					await songCache.removeCachedSongs([canonicalKey(id)])
				} catch {
					// キャッシュ削除失敗は致命的ではない
				}
			} else {
				const { [id]: _, ...rest } = localSongs.value
				localSongs.value = rest
			}

			songs.value = songs.value.filter(s => s.id !== id)
			if (currentSong.value?.id === id) {
				currentSong.value = null
			}
		} catch (e) {
			error.value = e instanceof Error ? e.message : '曲の削除に失敗しました'
			throw e
		} finally {
			loading.value = false
		}
	}

	return {
		songs,
		currentSong,
		loading,
		error,
		sortedSongs,
		fetchSongs,
		fetchSong,
		saveSong,
		removeSong
	}
})
