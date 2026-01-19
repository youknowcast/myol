<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const passcode = ref('')
const error = ref(false)
const inputRefs = ref<HTMLInputElement[]>([])
const usernameRef = ref<HTMLInputElement | null>(null)
const isSubmitting = ref(false)

const passcodeChars = computed(() => passcode.value.split(''))
const isPasscodeComplete = computed(() => passcode.value.length === 6)
const hasUsername = computed(() => username.value.trim().length > 0)

onMounted(() => {
  usernameRef.value?.focus()
})

function normalizePasscode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)
}

function handleInput(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  if (input.value === '') {
    return
  }

  const characters = passcode.value.split('')
  characters[index] = input.value
  const nextValue = normalizePasscode(characters.join(''))

  passcode.value = nextValue
  input.value = passcodeChars.value[index] ?? ''
  error.value = false

  if (nextValue.length > index) {
    currentFocus(index + 1)
  }

  if (isPasscodeComplete.value) {
    attemptLogin()
  }
}

function handleKeydown(index: number, event: KeyboardEvent) {
  if (event.key === 'Backspace') {
    event.preventDefault()
    const characters = passcode.value.split('')
    characters[index] = ''
    passcode.value = normalizePasscode(characters.join(''))
    error.value = false
    currentFocus(Math.max(index - 1, 0))
    return
  }

  if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
    event.preventDefault()
    const characters = passcode.value.split('')
    characters[index] = event.key
    passcode.value = normalizePasscode(characters.join(''))
    error.value = false
    currentFocus(Math.min(index + 1, 5))
    if (isPasscodeComplete.value) {
      attemptLogin()
    }
  }
}

function handlePaste(event: ClipboardEvent) {
  const pasted = event.clipboardData?.getData('text') ?? ''
  if (!pasted) return

  event.preventDefault()
  passcode.value = normalizePasscode(pasted)
  error.value = false
  currentFocus(passcode.value.length)

  if (isPasscodeComplete.value) {
    attemptLogin()
  }
}

function currentFocus(nextIndex: number) {
  if (nextIndex >= 0 && nextIndex < 6) {
    inputRefs.value[nextIndex]?.focus()
  }
}

async function attemptLogin() {
  if (!canSubmit.value) return

  isSubmitting.value = true
  const success = await authStore.login(username.value, passcode.value)
  isSubmitting.value = false

  if (success) {
    router.push({ name: 'home' })
    return
  }

  error.value = true
  passcode.value = ''
  currentFocus(0)
}

function setInputRef(el: HTMLInputElement | null, index: number) {
  if (el) {
    inputRefs.value[index] = el
  }
}

const canSubmit = computed(() => hasUsername.value && isPasscodeComplete.value && !isSubmitting.value)
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <div class="logo">
        <img src="/icon-192.png" alt="myol" class="logo-icon" />
      </div>

      <p class="login-subtitle">ユーザー名とパスコードを入力</p>

      <label class="login-label" for="username">ユーザー名</label>
      <input
        id="username"
        v-model.trim="username"
        type="text"
        autocomplete="username"
        class="login-input"
        placeholder="username"
        ref="usernameRef"
      />

      <label class="login-label" for="passcode">パスコード (6桁英数)</label>
      <div class="pin-input-container" :class="{ 'has-error': error }">
        <input
          v-for="(_, index) in 6"
          :key="index"
          :value="passcodeChars[index] ?? ''"
          type="text"
          inputmode="text"
          maxlength="1"
          autocapitalize="characters"
          autocomplete="one-time-code"
          class="pin-input"
          :class="{ filled: passcodeChars[index] }"
          @input="handleInput(index, $event)"
          @keydown="handleKeydown(index, $event)"
          @paste="handlePaste"
          :ref="(el) => setInputRef(el as HTMLInputElement, index)"
        />
      </div>

      <button
        class="login-button"
        :disabled="!canSubmit"
        @click="attemptLogin"
      >
        <span v-if="isSubmitting">確認中...</span>
        <span v-else>ログイン</span>
      </button>

      <p v-if="error" class="error-message">
        ユーザー名またはパスコードが違います
      </p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-bg) 0%, var(--color-bg-secondary) 100%);
  padding: var(--spacing-md);
}

.login-container {
  text-align: center;
  width: 100%;
  max-width: 360px;
}

.login-label {
  display: block;
  text-align: left;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}

.login-input {
  width: 100%;
  height: 3rem;
  border-radius: var(--radius-lg);
  border: 2px solid var(--color-border);
  background: var(--color-bg-card);
  color: var(--color-text);
  padding: 0 var(--spacing-md);
  font-size: 1rem;
  margin-bottom: var(--spacing-md);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.login-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

.logo {
  margin-bottom: var(--spacing-xl);
}

.logo-icon {
  width: 120px;
  height: 120px;
  border-radius: var(--radius-lg);
}

.logo-text {
  font-size: 2.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.login-subtitle {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

.pin-input-container {
  display: flex;
  justify-content: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
}

.pin-input {
  width: 2.6rem;
  height: 3.2rem;
  text-align: center;
  font-size: 1.25rem;
  font-weight: 600;
  background: var(--color-bg-card);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text);
  transition: all var(--transition-fast);
}

.pin-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

.pin-input.filled {
  border-color: var(--color-primary);
  background: var(--color-bg-secondary);
}

.login-button {
  width: 100%;
  height: 3rem;
  border-radius: var(--radius-lg);
  background: var(--color-primary);
  color: white;
  font-weight: 600;
  margin-bottom: var(--spacing-md);
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

.login-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-button:not(:disabled):hover {
  transform: translateY(-1px);
}

.pin-input-container.has-error .pin-input {
  border-color: var(--color-error);
  animation: shake 0.4s ease-in-out;
}

.error-message {
  color: var(--color-error);
  font-size: 0.875rem;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
}
</style>
