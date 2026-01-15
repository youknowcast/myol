import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Song, SongMeta } from '@/lib/chordpro/types'

export const useSongsStore = defineStore('songs', () => {
	const songs = ref<SongMeta[]>([])
	const currentSong = ref<Song | null>(null)
	const loading = ref(false)
	const error = ref<string | null>(null)

	const sortedSongs = computed(() => {
		return [...songs.value].sort((a, b) => a.title.localeCompare(b.title, 'ja'))
	})

	async function fetchSongs() {
		loading.value = true
		error.value = null
		try {
			// TODO: S3 から曲リストを取得
			// 仮データ
			songs.value = [
				{ id: 'amazing-grace', title: 'Amazing Grace', artist: 'Traditional', key: 'G' },
				{ id: 'hotel-california', title: 'Hotel California', artist: 'Eagles', key: 'Bm' }
			]
		} catch (e) {
			error.value = e instanceof Error ? e.message : '曲の取得に失敗しました'
		} finally {
			loading.value = false
		}
	}

	async function fetchSong(id: string) {
		loading.value = true
		error.value = null
		try {
			// TODO: S3 から曲データを取得
			// 仮データ
			currentSong.value = {
				id,
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

{start_of_verse label="Verse 1"}
[G]Amazing [G/B]grace how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me
[G]I once was [G/B]lost but [C]now am [G]found
Was [G]blind but [D]now I [G]see
{end_of_verse}

{start_of_grid label="Chord Progression" shape="4x4"}
|| G . . . | G/B . . . | C . . . | G . . . |
| G . . . | Em . . . | D . . . | D . . . |
| G . . . | G/B . . . | C . . . | G . . . |
| G . . . | D . . . | G . . . | G . . . ||
{end_of_grid}`
			}
		} catch (e) {
			error.value = e instanceof Error ? e.message : '曲の取得に失敗しました'
		} finally {
			loading.value = false
		}
	}

	async function saveSong(song: Song) {
		loading.value = true
		error.value = null
		try {
			// TODO: S3 に保存
			console.log('Saving song:', song)
		} catch (e) {
			error.value = e instanceof Error ? e.message : '曲の保存に失敗しました'
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
		saveSong
	}
})
