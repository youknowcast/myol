/**
 * S3 API client for myol
 * Uses Lambda function to get presigned URLs for S3 operations
 */

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || ''

interface PresignedUrlResponse {
	url: string
	key: string
	expiresIn: number
}

interface ListSongsResponse {
	songs: {
		id: string
		key: string
		lastModified?: string
		size?: number
	}[]
}

interface ApiError {
	error: string
}

async function callApi<T>(body: object): Promise<T> {
	if (!API_ENDPOINT) {
		throw new Error('API endpoint not configured. Set VITE_API_ENDPOINT environment variable.')
	}

	const response = await fetch(API_ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	})

	const data = await response.json()

	if (!response.ok) {
		throw new Error((data as ApiError).error || 'API request failed')
	}

	return data as T
}

/**
 * List all songs from S3
 */
export async function listSongs(): Promise<ListSongsResponse['songs']> {
	const response = await callApi<ListSongsResponse>({ operation: 'list' })
	return response.songs
}

/**
 * Get song content from S3
 */
export async function getSongContent(key: string): Promise<string> {
	// Get presigned URL
	const { url } = await callApi<PresignedUrlResponse>({
		operation: 'get',
		key: key.endsWith('.cho') ? key : `${key}.cho`
	})

	// Fetch content using presigned URL
	const response = await fetch(url)

	if (!response.ok) {
		throw new Error(`Failed to fetch song: ${response.statusText}`)
	}

	return await response.text()
}

/**
 * Save song content to S3
 */
export async function saveSongContent(key: string, content: string): Promise<void> {
	// Get presigned URL for PUT
	const { url } = await callApi<PresignedUrlResponse>({
		operation: 'put',
		key: key.endsWith('.cho') ? key : `${key}.cho`,
		contentType: 'text/plain; charset=utf-8'
	})

	// Upload content using presigned URL
	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			'Content-Type': 'text/plain; charset=utf-8'
		},
		body: content
	})

	if (!response.ok) {
		throw new Error(`Failed to save song: ${response.statusText}`)
	}
}

/**
 * Delete song from S3
 */
export async function deleteSong(key: string): Promise<void> {
	await callApi<{ success: boolean }>({
		operation: 'delete',
		key: key.endsWith('.cho') ? key : `${key}.cho`
	})
}

/**
 * Check if API is configured
 */
export function isApiConfigured(): boolean {
	return !!API_ENDPOINT
}
