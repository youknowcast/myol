/**
 * IndexedDB cache for song contents
 */

export interface CachedSong {
	key: string
	content: string
	lastModified?: string
	fetchedAt: number
}

const DB_NAME = 'myol-cache'
const DB_VERSION = 1
const STORE_NAME = 'songs'

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'key' })
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

async function withStore<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openDb()
	try {
		return await new Promise<T>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, mode)
			const request = fn(transaction.objectStore(STORE_NAME))
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
	} finally {
		db.close()
	}
}

async function withTransaction(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => void): Promise<void> {
	const db = await openDb()
	try {
		return await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, mode)
			fn(transaction.objectStore(STORE_NAME))
			transaction.oncomplete = () => resolve()
			transaction.onerror = () => reject(transaction.error)
			transaction.onabort = () => reject(transaction.error)
		})
	} finally {
		db.close()
	}
}

/**
 * Get all cached songs
 */
export async function getAllCachedSongs(): Promise<CachedSong[]> {
	return await withStore('readonly', store => store.getAll())
}

/**
 * Get a single cached song by key
 */
export async function getCachedSong(key: string): Promise<CachedSong | undefined> {
	return await withStore('readonly', store => store.get(key))
}

/**
 * Store (or overwrite) songs in the cache
 */
export async function putCachedSongs(songs: CachedSong[]): Promise<void> {
	if (songs.length === 0) return
	await withTransaction('readwrite', store => {
		for (const song of songs) {
			store.put(song)
		}
	})
}

/**
 * Remove songs from the cache by key
 */
export async function removeCachedSongs(keys: string[]): Promise<void> {
	if (keys.length === 0) return
	await withTransaction('readwrite', store => {
		for (const key of keys) {
			store.delete(key)
		}
	})
}

/**
 * Clear the entire song cache
 */
export async function clearSongCache(): Promise<void> {
	await withTransaction('readwrite', store => {
		store.clear()
	})
}
