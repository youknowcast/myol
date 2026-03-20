import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

function toBase64Url(value: string): string {
  return btoa(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function createAuthStoreWithRemoteConfig(configText: string) {
  vi.resetModules()
  vi.stubEnv('VITE_API_ENDPOINT', 'https://example.lambda-url.us-west-2.on.aws')
  vi.stubEnv('VITE_AUTH_CONFIG_KEY', 'config/auth.json')

  const fetchMock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://signed.example.com/config' })
    })
    .mockResolvedValueOnce({
      ok: true,
      text: async () => configText
    })

  Object.defineProperty(globalThis, 'fetch', {
    value: fetchMock,
    configurable: true,
    writable: true
  })

  const { useAuthStore } = await import('./auth')
  return { authStore: useAuthStore(), fetchMock }
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    Object.defineProperty(globalThis, 'localStorage', {
      value: new LocalStorageMock(),
      configurable: true
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('logs in with remote passcode hash', async () => {
    const hash = bcrypt.hashSync('123456', 10)
    const { authStore, fetchMock } = await createAuthStoreWithRemoteConfig(
      JSON.stringify({ passcodeHash: hash, version: 1 })
    )

    const ok = await authStore.login('123456')

    expect(ok).toBe(true)
    expect(authStore.isAuthenticated).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('accepts b64 prefixed passcode hash', async () => {
    const hash = bcrypt.hashSync('123456', 10)
    const { authStore } = await createAuthStoreWithRemoteConfig(
      JSON.stringify({ passcodeHash: `b64:${toBase64Url(hash)}` })
    )

    const ok = await authStore.login('123456')

    expect(ok).toBe(true)
    expect(authStore.isAuthenticated).toBe(true)
  })

  it('rejects non 6-digit passcode before remote fetch', async () => {
    const hash = bcrypt.hashSync('123456', 10)
    const { authStore, fetchMock } = await createAuthStoreWithRemoteConfig(
      JSON.stringify({ passcodeHash: hash })
    )

    const ok = await authStore.login('12ab56')

    expect(ok).toBe(false)
    expect(authStore.isAuthenticated).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('expires persisted session after ttl', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-01-01T00:00:00.000Z')
    vi.setSystemTime(now)

    const storage = new LocalStorageMock()
    storage.setItem('myol_auth_session', JSON.stringify({
      authenticatedAt: now.getTime() - 12 * 60 * 60 * 1000 - 1,
      version: 1
    }))

    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true
    })

    vi.resetModules()
    vi.stubEnv('VITE_API_ENDPOINT', 'https://example.lambda-url.us-west-2.on.aws')
    vi.stubEnv('VITE_AUTH_CONFIG_KEY', 'config/auth.json')
    const { useAuthStore } = await import('./auth')
    const authStore = useAuthStore()

    expect(authStore.isAuthenticated).toBe(false)
    expect(storage.getItem('myol_auth_session')).toBeNull()
  })

  it('invalidates session when auth config version changes', async () => {
    const storage = new LocalStorageMock()
    storage.setItem('myol_auth_session', JSON.stringify({
      authenticatedAt: Date.now(),
      version: 1
    }))

    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true
    })

    vi.resetModules()
    vi.stubEnv('VITE_API_ENDPOINT', 'https://example.lambda-url.us-west-2.on.aws')
    vi.stubEnv('VITE_AUTH_CONFIG_KEY', 'config/auth.json')

    const hash = bcrypt.hashSync('123456', 10)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://signed.example.com/config' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ passcodeHash: hash, version: 2 })
      })

    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      configurable: true,
      writable: true
    })

    const { useAuthStore } = await import('./auth')
    const authStore = useAuthStore()

    const active = await authStore.ensureAuthenticated()

    expect(active).toBe(false)
    expect(authStore.isAuthenticated).toBe(false)
    expect(storage.getItem('myol_auth_session')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
