import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import bcrypt from 'bcryptjs'

const AUTH_USERS = import.meta.env.VITE_AUTH_USERS || ''
const AUTH_KEY = 'myol_authenticated'
const B64_PREFIX = 'b64:'

interface AuthUser {
	username: string
	hash: string
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

		const users = parseAuthUsers(AUTH_USERS)
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
