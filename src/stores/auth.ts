import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const AUTH_SESSION_KEY = 'myol_auth_session'
const AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000

// 意図的なダウングレード（docs/superpowers/specs/2026-07-04-auth-simplification-design.md 参照）:
// 初見の第三者の抑止のみが目的。値はリポジトリ・配布バンドルに露出する。
const FIXED_PASSCODE = '9999'

interface AuthSession {
  authenticatedAt: number
}

function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { authenticatedAt?: unknown }
    if (typeof parsed.authenticatedAt !== 'number') return null
    return { authenticatedAt: parsed.authenticatedAt }
  } catch {
    return null
  }
}

function isSessionActive(session: AuthSession | null): boolean {
  if (!session) return false
  const age = Date.now() - session.authenticatedAt
  return age >= 0 && age < AUTH_SESSION_TTL_MS
}

function isPasscodeFormatValid(passcode: string): boolean {
  return /^\d{4}$/.test(passcode)
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(loadSession())

  function clearSession() {
    session.value = null
    localStorage.removeItem(AUTH_SESSION_KEY)
  }

  const isAuthenticated = computed(() => {
    const active = isSessionActive(session.value)
    if (!active && session.value) {
      clearSession()
    }
    return active
  })

  async function ensureAuthenticated(): Promise<boolean> {
    if (!isSessionActive(session.value)) {
      if (session.value) {
        clearSession()
      }
      return false
    }
    return true
  }

  async function login(passcode: string): Promise<boolean> {
    const normalized = passcode.trim()
    if (!isPasscodeFormatValid(normalized)) return false
    if (normalized !== FIXED_PASSCODE) return false

    session.value = { authenticatedAt: Date.now() }
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session.value))
    return true
  }

  function logout() {
    clearSession()
  }

  return {
    isAuthenticated,
    ensureAuthenticated,
    login,
    logout
  }
})
