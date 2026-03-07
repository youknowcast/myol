import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import bcrypt from 'bcryptjs'

class LocalStorageMock {
	private storage = new Map<string, string>()

	getItem(key: string) {
		return this.storage.get(key) ?? null
	}

	setItem(key: string, value: string) {
		this.storage.set(key, value)
	}

	removeItem(key: string) {
		this.storage.delete(key)
	}

	clear() {
		this.storage.clear()
	}
}

async function createAuthStore(users: string) {
	vi.resetModules()
	vi.stubEnv('VITE_AUTH_USERS', users)
	const { useAuthStore } = await import('./auth')
	return useAuthStore()
}

function toBase64Url(value: string): string {
	return btoa(value)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '')
}

describe('auth store', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.unstubAllEnvs()
		Object.defineProperty(globalThis, 'localStorage', {
			value: new LocalStorageMock(),
			configurable: true
		})
	})

	it('logs in with raw bcrypt hash', async () => {
		const hash = bcrypt.hashSync('ABC123', 10)
		const authStore = await createAuthStore(`youknow:${hash}`)

		const ok = await authStore.login('youknow', 'abc123')

		expect(ok).toBe(true)
		expect(authStore.isAuthenticated).toBe(true)
	})

	it('logs in with b64-prefixed hash', async () => {
		const hash = bcrypt.hashSync('ABC123', 10)
		const encoded = toBase64Url(hash)
		const authStore = await createAuthStore(`youknow:b64:${encoded}`)

		const ok = await authStore.login('youknow', 'abc123')

		expect(ok).toBe(true)
		expect(authStore.isAuthenticated).toBe(true)
	})

	it('fails login for invalid b64 hash payload', async () => {
		const authStore = await createAuthStore('youknow:b64:%%%%')

		const ok = await authStore.login('youknow', 'ABC123')

		expect(ok).toBe(false)
		expect(authStore.isAuthenticated).toBe(false)
	})
})
