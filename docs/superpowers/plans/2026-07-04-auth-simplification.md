# 認証簡素化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログインを「コード内定数との4桁固定パスコード照合」に置き換え、S3 設定取得・bcrypt・CI シークレット連携を全廃する。

**Architecture:** `auth.ts` はネットワークに一切触れない同期照合 + localStorage セッション（12h TTL、現行キー・現行構造の互換維持）だけになる。LoginPage は 4 マス PIN 入力に縮小。CI から auth 関連 3 ステップとシークレット参照が消え、`MYOL_AUTH_CONFIG_JSON` なしでデプロイが通るようになる。

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vitest。`bcryptjs` を依存から削除。

**Spec:** `docs/superpowers/specs/2026-07-04-auth-simplification-design.md`

**Branch:** `feature/simplify-auth`（main から作成）

## Global Constraints

- `.ts` ファイルはタブ…ではなく **`auth.ts` / `auth.test.ts` は既存どおり2スペース**（このファイル群は例外的に2スペースで書かれている。既存スタイルに一致させる）。`.vue` も2スペース
- コミット前に必ず `npm run lint` と `npm run test` を実行し、両方成功を確認する
- **README・仕様書・計画書にパスコードの具体値を書かない**（コードとテストコードのみが値を持つ）
- 公開 API 維持: `useAuthStore` は `isAuthenticated` / `ensureAuthenticated()` / `login(passcode)` / `logout()` を同じ型（login/ensureAuthenticated は Promise 返し）で公開し続ける — router guard と LoginPage は await している
- セッション: localStorage キー `myol_auth_session`、TTL 12時間、旧形式（`version` フィールド付き）JSON の読み込み互換

---

### Task 1: auth ストアの置き換えとテスト書き換え

**Files:**
- Modify: `src/stores/auth.ts`（全面置換 — 260行 → 約75行）
- Modify: `src/stores/auth.test.ts`（全面置換）

**Interfaces:**
- Consumes: なし（ネットワーク・環境変数への依存が消える）
- Produces: `useAuthStore` — `isAuthenticated: ComputedRef<boolean>`, `ensureAuthenticated(): Promise<boolean>`, `login(passcode: string): Promise<boolean>`, `logout(): void`（現行と同一シグネチャ。`src/router/index.ts` と `LoginPage.vue` は無変更で動く）

- [ ] **Step 1: 失敗するテストを書く（テストファイルを全面置換）**

`src/stores/auth.test.ts` を以下の内容に置換:

```ts
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/stores/auth.test.ts`
Expected: FAIL（現実装は 6桁 + リモート設定必須のため `login('9999')` が false になる等）

- [ ] **Step 3: auth.ts を全面置換**

```ts
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/stores/auth.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: lint + 全テスト + コミット**

```bash
npm run lint && npm run test
git add src/stores/auth.ts src/stores/auth.test.ts
git commit -m "Replace remote auth with fixed 4-digit passcode"
```

---

### Task 2: LoginPage の4桁化

**Files:**
- Modify: `src/pages/LoginPage.vue`

**Interfaces:**
- Consumes: Task 1 の `login`（4桁を渡す）
- Produces: 4マスの PIN 入力 UI。挙動（自動フォーカス送り・Backspace・ペースト・全桁入力で自動送信）は現行踏襲

- [ ] **Step 1: 桁数を定数化して置換**

script 冒頭（`const passcode = ref('')` の前）に追加:

```ts
const PASSCODE_LENGTH = 4
```

以下のハードコード 6/5 をすべて定数由来に置換:

- `isPasscodeComplete`: `passcode.value.length === PASSCODE_LENGTH`
- `normalizePasscode`: `.slice(0, PASSCODE_LENGTH)`
- `handleKeydown` の `Math.min(index + 1, 5)` → `Math.min(index + 1, PASSCODE_LENGTH - 1)`
- `currentFocus` の `nextIndex < 6` → `nextIndex < PASSCODE_LENGTH`
- template の `v-for="(_, index) in 6"` → `v-for="(_, index) in PASSCODE_LENGTH"`

文言変更:

- `<p class="login-subtitle">` → `4桁の数字パスコードを入力`
- `<label class="login-label" ...>` → `パスコード (4桁数字)`

- [ ] **Step 2: ビルド + lint + 全テスト + コミット**

```bash
npm run build && npm run lint && npm run test
git add src/pages/LoginPage.vue
git commit -m "Shrink login to a 4-digit passcode input"
```

---

### Task 3: 周辺機構の撤去（依存・CI・環境変数・README）

**Files:**
- Modify: `package.json` + `package-lock.json`（`bcryptjs` 削除、`hash:passcode` / `hash:passcode:b64` scripts 削除）
- Modify: `.github/workflows/deploy.yml`
- Modify: `.env.example`（`VITE_AUTH_CONFIG_KEY` 行削除）
- Modify: `src/vite-env.d.ts`（`VITE_AUTH_CONFIG_KEY` 行削除）
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 完了（bcryptjs の import 消滅済み）
- Produces: `MYOL_AUTH_CONFIG_JSON` / `MYOL_AUTH_USERS_CONFIG_JSON` シークレットなしで通るデプロイパイプライン

- [ ] **Step 1: 依存とスクリプトの削除**

```bash
npm uninstall bcryptjs
```

`package.json` から `hash:passcode` と `hash:passcode:b64` の2スクリプトを削除。

- [ ] **Step 2: deploy.yml の auth ステップ撤去**

- `env:` から3行削除: `MYOL_AUTH_CONFIG_JSON`, `MYOL_AUTH_USERS_CONFIG_JSON`, `VITE_AUTH_CONFIG_KEY`
- `Validate required deployment env` ステップから auth シークレットのチェックブロック（`if [ -z "${MYOL_AUTH_CONFIG_JSON:-}" ] ...` の4行）を削除。前段の for ループ（他の必須変数チェック）は残す
- `Validate auth config JSON` ステップを丸ごと削除
- `Upload auth config to S3` ステップを丸ごと削除

- [ ] **Step 3: 環境変数定義の削除**

- `.env.example`: `VITE_AUTH_CONFIG_KEY=config/auth.json` の行を削除
- `src/vite-env.d.ts`: `readonly VITE_AUTH_CONFIG_KEY: string` の行を削除

- [ ] **Step 4: README の書き換え**

「## 認証仕様 (移行中)」節（`config/auth.json` の例・`hash:passcode` 説明・「### ローカル開発時の扱い」を含む全体）を以下に置換（**具体的なパスコード値は書かない**）:

```markdown
## 認証

ログインは4桁数字の固定パスコードです（値は `src/stores/auth.ts` の定数）。

- 目的は「初見の第三者が操作できないようにする」抑止のみで、それ以上の保護は意図していません（パスコードはリポジトリおよび配布バンドルから読み取れます）
- セッションは localStorage に保存され、12時間で失効します
- ネットワーク・外部設定に依存しないため、ローカル開発でもそのままログインできます
```

- 環境変数の表から `VITE_AUTH_CONFIG_KEY` の行を削除
- 「デプロイ (CI)」節の Repository Secrets リストから `MYOL_AUTH_CONFIG_JSON` と `MYOL_AUTH_USERS_CONFIG_JSON` の2項目、および末尾の「CI では `MYOL_AUTH_CONFIG_JSON` または…」の2行の段落を削除

- [ ] **Step 5: スイープ + ビルド + lint + 全テスト**

```bash
grep -rn "bcrypt\|passcodeHash\|AUTH_CONFIG\|hash:passcode" src/ package.json .github/ .env.example README.md
```
Expected: 0件。

```bash
npm run build && npm run lint && npm run test
```
Expected: すべて成功。

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json .github/workflows/deploy.yml .env.example src/vite-env.d.ts README.md
git commit -m "Remove remote auth machinery from CI, deps and docs"
```

---

## 完了条件

- `npm run build && npm run lint && npm run test` がすべて成功、Task 3 の grep が 0 件
- 手動確認（中和 dev サーバー）: ログイン画面が4マス表示 → 誤入力でエラー表示・正しい4桁でホームへ遷移 → リロードしてもセッション維持 → ログアウトでログイン画面に戻る
- デプロイへの影響注意: マージ後の CI 実行で auth 3ステップが消えたパイプラインが通ること（`MYOL_AUTH_CONFIG_JSON` シークレットは以後未参照。GitHub 上のシークレット自体の削除は任意・手動）
