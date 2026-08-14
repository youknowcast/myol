import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Song, SongMeta } from '@/lib/chordpro/types'
import { extractSongMeta } from '@/lib/chordpro/parser'
import * as s3Api from '@/lib/s3/client'
import * as songCache from '@/lib/cache/songCache'
import type { CachedSong } from '@/lib/cache/songCache'

const CACHE_TTL_MS = 5 * 60 * 1000
const FETCH_CONCURRENCY = 4

function isFresh(fetchedAt: number): boolean {
	return Date.now() - fetchedAt < CACHE_TTL_MS
}

/**
 * 並列度を制限してマップする
 */
async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length)
	let index = 0
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (index < items.length) {
			const i = index++
			results[i] = await fn(items[i]!)
		}
	})
	await Promise.all(workers)
	return results
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

	// 非同期結果の世代管理: fetchSongs / fetchSong は開始時の世代を記録し、
	// 完了時に世代が進んでいたら (新しい遷移・保存・削除) 結果を破棄する
	let fetchGen = 0

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
The [G]hour I [D]first be[G]lieved
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
		// 開始時点の世代を記録: 待機中に保存・削除・新しい取得が起きたら結果を破棄する
		const gen = ++fetchGen
		loading.value = true
		error.value = null
		try {
			if (!s3Api.isApiConfigured()) {
				// API 未設定時はローカルデータを使用
				songs.value = localSongMetas()
				return
			}

			// キャッシュがあれば即表示 (ローカル状態のスナップショットなので無条件で安全)
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
				if (gen !== fetchGen) return
				if (cached.length === 0) {
					error.value = e instanceof Error ? e.message : '曲の取得に失敗しました'
					// エラー時もローカルデータを表示
					songs.value = localSongMetas()
				}
				return
			}

			// 待機中に保存・削除・新しい取得が起きていたら結果を破棄
			if (gen !== fetchGen) return

			const cacheByKey = new Map(cached.map(c => [c.key, c]))
			const now = Date.now()
			const toPersist: CachedSong[] = []
			const metaByKey = new Map<string, SongMeta>()
			const pending: typeof s3Songs = []

			// パス1: キャッシュで充足できる曲を確定させる
			for (const s of s3Songs) {
				const entry = cacheByKey.get(s.key)
				if (entry && (entry.lastModified === s.lastModified || isFresh(entry.fetchedAt))) {
					// 変更なし、または直近取得済み (throttle)。lastModified は進めない
					metaByKey.set(s.key, toSongMeta(entry.content, s.id))
				} else {
					pending.push(s)
				}
			}

			// パス2: 差分のある曲だけ並列で再取得
			const fetched = await mapWithConcurrency(pending, FETCH_CONCURRENCY, async (s) => {
				try {
					const content = await s3Api.getSongContent(s.key)
					return { s, content } as const
				} catch {
					return { s, content: null } as const
				}
			})

			for (const { s, content } of fetched) {
				if (content !== null) {
					toPersist.push({ key: s.key, content, lastModified: s.lastModified, fetchedAt: now })
					metaByKey.set(s.key, toSongMeta(content, s.id))
				} else {
					// 取得失敗時はキャッシュがあれば維持
					const entry = cacheByKey.get(s.key)
					metaByKey.set(
						s.key,
						entry ? toSongMeta(entry.content, s.id) : { id: s.id, title: s.id, artist: '' }
					)
				}
			}

			// リモートの並び順を保って一覧を組み立てる
			const metaList = s3Songs.map(s => metaByKey.get(s.key) ?? { id: s.id, title: s.id, artist: '' })

			// リモートで削除された曲をキャッシュから除去
			const removedKeys = cached
				.filter(c => !s3Songs.some(s => s.key === c.key))
				.map(c => c.key)

			// 差分取得中に保存・削除が起きていたら書き込みと一覧反映を破棄
			if (gen !== fetchGen) return
			try {
				await songCache.putCachedSongs(toPersist)
				await songCache.removeCachedSongs(removedKeys)
			} catch {
				// キャッシュ書き込み失敗は致命的ではない
			}

			if (gen !== fetchGen) return
			songs.value = metaList
		} finally {
			// 新しい操作が進行中なら loading を落とさない
			if (gen === fetchGen) loading.value = false
		}
	}

	async function fetchSong(id: string, options?: { force?: boolean }) {
		// 開始時点の世代を記録: 待機中に新しい遷移・保存・削除が起きたら結果を破棄する
		const gen = ++fetchGen
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

			if (cached && !options?.force) {
				if (gen !== fetchGen) return
				// キャッシュで即表示
				setCurrentSong(id, cached.content)
				loading.value = false

				if (!isFresh(cached.fetchedAt)) {
					// 期限切れならバックグラウンドで再検証
					try {
						const content = await s3Api.getSongContent(id)
						if (gen !== fetchGen) return
						setCurrentSong(id, content)
						await songCache.putCachedSongs([{ ...cached, content, fetchedAt: Date.now() }])
					} catch {
						// キャッシュ表示を維持
					}
				}
				return
			}

			// キャッシュミス or 強制再取得 → S3 から取得して保存。
			// 取得失敗は外側の catch へ: 強制 (編集フロー) は失敗を呼び出し元へ
			// 伝播させ、空・フォールバック内容で保存する事故を防ぐ
			const content = await s3Api.getSongContent(id)
			if (gen !== fetchGen) return
			setCurrentSong(id, content)
			try {
				await songCache.putCachedSongs([{ ...cached, key, content, fetchedAt: Date.now() }])
			} catch {
				// キャッシュ保存失敗は致命的ではない
			}
		} catch (e) {
			// 新しい操作が進行中なら error / currentSong を書き換えない
			if (gen !== fetchGen) {
				if (options?.force) throw e
				return
			}
			error.value = e instanceof Error ? e.message : '曲の取得に失敗しました'
			if (options?.force) {
				throw e
			}
			// エラー時はローカルデータを試す
			currentSong.value = localSongs.value[id] ?? null
		} finally {
			// 新しい操作が進行中なら loading を落とさない
			if (gen === fetchGen) loading.value = false
		}
	}

	async function saveSong(song: Song) {
		const gen = ++fetchGen
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
			if (gen === fetchGen) {
				error.value = e instanceof Error ? e.message : '曲の保存に失敗しました'
			}
			throw e
		} finally {
			if (gen === fetchGen) loading.value = false
		}
	}

	async function removeSong(id: string) {
		const gen = ++fetchGen
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
			if (gen === fetchGen) {
				error.value = e instanceof Error ? e.message : '曲の削除に失敗しました'
			}
			throw e
		} finally {
			if (gen === fetchGen) loading.value = false
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
