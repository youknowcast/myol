import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import bcrypt from 'bcryptjs'

const AUTH_USERS = import.meta.env.VITE_AUTH_USERS || ''
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || ''
const AUTH_CONFIG_KEY = import.meta.env.VITE_AUTH_CONFIG_KEY || 'config/auth-users.json'
const AUTH_KEY = 'myol_authenticated'
const B64_PREFIX = 'b64:'

interface AuthUser {
	username: string
	hash: string
}

interface PresignedUrlResponse {
	url: string
}

interface RemoteAuthConfig {
	users?: Array<{ username?: string; hash?: string }>
	authUsers?: string
}

function decodeBase64Url(value: string): string {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
	try {
		return atob(padded)
	} catch {
		return ''
	}
}

function normalizeHash(rawHash: string): string {
	const trimmed = rawHash.trim()
	if (!trimmed) return ''
	if (trimmed.startsWith(B64_PREFIX)) {
		return decodeBase64Url(trimmed.slice(B64_PREFIX.length))
	}
	return trimmed
}

function parseAuthUsers(raw: string): AuthUser[] {
	if (!raw) return []

	return raw
		.split(',')
		.map(entry => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const separatorIndex = entry.indexOf(':')
			if (separatorIndex <= 0) {
				return { username: '', hash: '' }
			}
			return {
				username: entry.slice(0, separatorIndex).trim(),
				hash: entry.slice(separatorIndex + 1).trim()
			}
		})
		.filter(user => user.username && user.hash)
}

function parseRemoteAuthConfig(raw: string): AuthUser[] {
	const trimmed = raw.trim()
	if (!trimmed) return []

	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
		return parseAuthUsers(trimmed)
	}

	try {
		const parsed = JSON.parse(trimmed) as RemoteAuthConfig | Array<{ username?: string; hash?: string }>
		if (Array.isArray(parsed)) {
			return parsed
				.map(user => ({
					username: (user.username || '').trim(),
					hash: (user.hash || '').trim()
				}))
				.filter(user => user.username && user.hash)
		}

		if (typeof parsed.authUsers === 'string') {
			return parseAuthUsers(parsed.authUsers)
		}

		if (Array.isArray(parsed.users)) {
			return parsed.users
				.map(user => ({
					username: (user.username || '').trim(),
					hash: (user.hash || '').trim()
				}))
				.filter(user => user.username && user.hash)
		}
	} catch {
		return []
	}

	return []
}

async function fetchRemoteAuthUsers(): Promise<AuthUser[]> {
	if (!API_ENDPOINT || !AUTH_CONFIG_KEY) return []

	let apiResponse: Response
	try {
		apiResponse = await fetch(API_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ operation: 'get', key: AUTH_CONFIG_KEY })
		})
	} catch {
		return []
	}

	if (!apiResponse.ok) return []

	let payload: PresignedUrlResponse
	try {
		payload = await apiResponse.json() as PresignedUrlResponse
	} catch {
		return []
	}

	if (!payload.url) return []

	let configResponse: Response
	try {
		configResponse = await fetch(payload.url)
	} catch {
		return []
	}

	if (!configResponse.ok) return []

	let text = ''
	try {
		text = await configResponse.text()
	} catch {
		return []
	}

	return parseRemoteAuthConfig(text)
}

let cachedUsers: AuthUser[] | null = null
let usersPromise: Promise<AuthUser[]> | null = null

async function getAuthUsers(): Promise<AuthUser[]> {
	if (cachedUsers) return cachedUsers
	if (usersPromise) return usersPromise

	const envUsers = parseAuthUsers(AUTH_USERS)

	usersPromise = (async () => {
		const remoteUsers = await fetchRemoteAuthUsers()
		const resolved = remoteUsers.length > 0 ? remoteUsers : envUsers
		cachedUsers = resolved
		return resolved
	})()

	const resolved = await usersPromise
	usersPromise = null
	return resolved
}

export const useAuthStore = defineStore('auth', () => {
	const authenticated = ref(localStorage.getItem(AUTH_KEY) === 'true')

	const isAuthenticated = computed(() => authenticated.value)

	function isPasscodeFormatValid(passcode: string): boolean {
		return /^[A-Z0-9]{6}$/.test(passcode)
	}

	async function login(username: string, passcode: string): Promise<boolean> {
		const normalizedUsername = username.trim().toLowerCase()
		const normalizedPasscode = passcode.trim().toUpperCase()
		if (!isPasscodeFormatValid(normalizedPasscode)) return false

		const users = await getAuthUsers()
		const user = users.find(entry => entry.username.toLowerCase() === normalizedUsername)
		if (!user) return false

		const storedHash = normalizeHash(user.hash)
		if (!storedHash) return false

		let matches = false
		try {
			matches = await bcrypt.compare(normalizedPasscode, storedHash)
		} catch {
			return false
		}
		if (matches) {
			authenticated.value = true
			localStorage.setItem(AUTH_KEY, 'true')
			return true
		}
		return false
	}

	function logout() {
		authenticated.value = false
		localStorage.removeItem(AUTH_KEY)
	}

	return {
		isAuthenticated,
		login,
		logout
	}
})
