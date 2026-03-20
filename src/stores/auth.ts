import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import bcrypt from 'bcryptjs'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || ''
const AUTH_CONFIG_KEY = import.meta.env.VITE_AUTH_CONFIG_KEY || 'config/auth.json'
const AUTH_SESSION_KEY = 'myol_auth_session'
const AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const B64_PREFIX = 'b64:'

interface AuthConfig {
  passcodeHash: string
  version: number | null
}

interface PresignedUrlResponse {
  url: string
}

interface RemoteAuthConfig {
  passcodeHash?: string
  version?: unknown
}

interface AuthSession {
  authenticatedAt: number
  version: number | null
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

function toVersion(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10)
  }
  return null
}

function parseRemoteAuthConfig(raw: string): AuthConfig | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    const passcodeHash = normalizeHash(trimmed)
    if (!passcodeHash) return null
    return {
      passcodeHash,
      version: null
    }
  }

  try {
    const parsed = JSON.parse(trimmed) as RemoteAuthConfig
    if (typeof parsed.passcodeHash !== 'string') return null

    const passcodeHash = normalizeHash(parsed.passcodeHash)
    if (!passcodeHash) return null

    return {
      passcodeHash,
      version: toVersion(parsed.version)
    }
  } catch {
    return null
  }
}

async function fetchRemoteAuthConfig(): Promise<AuthConfig | null> {
  if (!API_ENDPOINT || !AUTH_CONFIG_KEY) return null

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
    return null
  }

  if (!apiResponse.ok) return null

  let payload: PresignedUrlResponse
  try {
    payload = await apiResponse.json() as PresignedUrlResponse
  } catch {
    return null
  }

  if (!payload.url) return null

  let configResponse: Response
  try {
    configResponse = await fetch(payload.url)
  } catch {
    return null
  }

  if (!configResponse.ok) return null

  let text = ''
  try {
    text = await configResponse.text()
  } catch {
    return null
  }

  return parseRemoteAuthConfig(text)
}

let cachedConfig: AuthConfig | null = null
let configPromise: Promise<AuthConfig | null> | null = null

async function getAuthConfig(): Promise<AuthConfig | null> {
  if (cachedConfig) return cachedConfig
  if (configPromise) return configPromise

  configPromise = (async () => {
    const resolved = await fetchRemoteAuthConfig()
    cachedConfig = resolved
    return resolved
  })()

  const resolved = await configPromise
  configPromise = null
  return resolved
}

function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_SESSION_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>
    if (typeof parsed.authenticatedAt !== 'number') return null
    return {
      authenticatedAt: parsed.authenticatedAt,
      version: typeof parsed.version === 'number' ? parsed.version : null
    }
  } catch {
    return null
  }
}

function clearSession() {
  localStorage.removeItem(AUTH_SESSION_KEY)
}

function isSessionActive(session: AuthSession | null): boolean {
  if (!session) return false
  const age = Date.now() - session.authenticatedAt
  return age >= 0 && age < AUTH_SESSION_TTL_MS
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(loadSession())

  const isAuthenticated = computed(() => {
    const active = isSessionActive(session.value)
    if (!active && session.value) {
      session.value = null
      clearSession()
    }
    return active
  })

  function isPasscodeFormatValid(passcode: string): boolean {
    return /^\d{6}$/.test(passcode)
  }

  function clearInvalidSession() {
    session.value = null
    clearSession()
  }

  async function ensureAuthenticated(): Promise<boolean> {
    if (!isSessionActive(session.value)) {
      if (session.value) {
        clearInvalidSession()
      }
      return false
    }

    const currentSession = session.value
    if (!currentSession) return false

    const config = await getAuthConfig()
    if (!config || config.version === null || currentSession.version === null) {
      return true
    }

    if (config.version !== currentSession.version) {
      clearInvalidSession()
      return false
    }

    return true
  }

  async function login(passcode: string): Promise<boolean> {
    const normalizedPasscode = passcode.trim()
    if (!isPasscodeFormatValid(normalizedPasscode)) return false

    const config = await getAuthConfig()
    if (!config) return false

    const storedHash = normalizeHash(config.passcodeHash)
    if (!storedHash) return false

    let matches = false
    try {
      matches = await bcrypt.compare(normalizedPasscode, storedHash)
    } catch {
      return false
    }

    if (!matches) return false

    session.value = {
      authenticatedAt: Date.now(),
      version: config.version
    }
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session.value))
    return true
  }

  function logout() {
    clearInvalidSession()
  }

  return {
    isAuthenticated,
    ensureAuthenticated,
    login,
    logout
  }
})
