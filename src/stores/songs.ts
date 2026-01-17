import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Song, SongMeta } from '@/lib/chordpro/types'
import { parseChordPro } from '@/lib/chordpro/parser'
import * as s3Api from '@/lib/s3/client'

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

	async function fetchSongs() {
		loading.value = true
		error.value = null
		try {
			if (s3Api.isApiConfigured()) {
				// S3 から曲リストを取得
				const s3Songs = await s3Api.listSongs()
				songs.value = await Promise.all(
					s3Songs.map(async (s) => {
						try {
							// 各曲のメタデータを取得するため内容を読み込む
							const content = await s3Api.getSongContent(s.key)
							const parsed = parseChordPro(content)
							return {
								id: s.id,
								title: parsed.title || s.id,
								artist: parsed.artist || '',
								key: parsed.key
							}
						} catch {
							// メタデータ取得失敗時は ID だけ使用
							return {
								id: s.id,
								title: s.id,
								artist: ''
							}
						}
					})
				)
			} else {
				// API 未設定時はローカルデータを使用
				songs.value = Object.values(localSongs.value).map(s => ({
					id: s.id,
					title: s.title,
					artist: s.artist,
					key: s.key
				}))
			}
		} catch (e) {
			error.value = e instanceof Error ? e.message : '曲の取得に失敗しました'
			// エラー時もローカルデータを表示
			songs.value = Object.values(localSongs.value).map(s => ({
				id: s.id,
				title: s.title,
				artist: s.artist,
				key: s.key
			}))
		} finally {
			loading.value = false
		}
	}

	async function fetchSong(id: string) {
		loading.value = true
		error.value = null
		try {
			if (s3Api.isApiConfigured()) {
				// S3 から曲データを取得
				const content = await s3Api.getSongContent(id)
				const parsed = parseChordPro(content)
				currentSong.value = {
					id,
					title: parsed.title || id,
					artist: parsed.artist || '',
					key: parsed.key,
					capo: parsed.capo,
					tempo: parsed.tempo,
					time: parsed.time,
					content
				}
			} else {
				// API 未設定時はローカルデータを使用
				currentSong.value = localSongs.value[id] ?? localSongs.value['amazing-grace'] ?? null
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
