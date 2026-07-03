import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

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

async function createAuthStore() {
  vi.resetModules()
  const { useAuthStore } = await import('./auth')
  return useAuthStore()
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'localStorage', {
      value: new LocalStorageMock(),
      configurable: true
    })
    // 認証はネットワークに一切触れないことを構造的に保証する
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(() => {
        throw new Error('auth must not touch the network')
      }),
      configurable: true,
      writable: true
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('logs in with the fixed 4-digit passcode and persists a session', async () => {
    const authStore = await createAuthStore()

    const ok = await authStore.login('9999')

    expect(ok).toBe(true)
    expect(authStore.isAuthenticated).toBe(true)
    const raw = localStorage.getItem('myol_auth_session')
    expect(raw).not.toBeNull()
    expect(typeof JSON.parse(raw!).authenticatedAt).toBe('number')
  })

  it('trims surrounding whitespace before matching', async () => {
    const authStore = await createAuthStore()
    expect(await authStore.login(' 9999 ')).toBe(true)
  })

  it('rejects wrong or malformed passcodes without touching the network', async () => {
    const authStore = await createAuthStore()

    for (const attempt of ['1234', '999', '99999', 'abcd', '']) {
      expect(await authStore.login(attempt)).toBe(false)
    }
    expect(authStore.isAuthenticated).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('expires persisted session after ttl', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-01-01T00:00:00.000Z')
    vi.setSystemTime(now)

    const storage = new LocalStorageMock()
    storage.setItem('myol_auth_session', JSON.stringify({
      authenticatedAt: now.getTime() - 12 * 60 * 60 * 1000 - 1
    }))
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true
    })

    const authStore = await createAuthStore()

    expect(authStore.isAuthenticated).toBe(false)
    expect(storage.getItem('myol_auth_session')).toBeNull()
  })

  it('accepts a legacy session that still carries a version field', async () => {
    const storage = new LocalStorageMock()
    storage.setItem('myol_auth_session', JSON.stringify({
      authenticatedAt: Date.now(),
      version: 1
    }))
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true
    })

    const authStore = await createAuthStore()

    expect(authStore.isAuthenticated).toBe(true)
    expect(await authStore.ensureAuthenticated()).toBe(true)
  })

  it('logout clears the session', async () => {
    const authStore = await createAuthStore()
    await authStore.login('9999')

    authStore.logout()

    expect(authStore.isAuthenticated).toBe(false)
    expect(localStorage.getItem('myol_auth_session')).toBeNull()
  })
})
