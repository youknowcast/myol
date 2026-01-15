<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const digits = ref<string[]>(['', '', '', ''])
const currentIndex = ref(0)
const error = ref(false)
const inputRefs = ref<HTMLInputElement[]>([])

onMounted(() => {
  inputRefs.value[0]?.focus()
})

function handleInput(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.value.replace(/\D/g, '').slice(-1)

  digits.value[index] = value
  error.value = false

  if (value && index < 3) {
    currentIndex.value = index + 1
    inputRefs.value[index + 1]?.focus()
  }

  // Check if all digits are entered
  if (digits.value.every(d => d !== '')) {
    attemptLogin()
  }
}

function handleKeydown(index: number, event: KeyboardEvent) {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    currentIndex.value = index - 1
    inputRefs.value[index - 1]?.focus()
  }
}

function attemptLogin() {
  const password = digits.value.join('')

  if (authStore.login(password)) {
    router.push({ name: 'home' })
  } else {
    error.value = true
    digits.value = ['', '', '', '']
    currentIndex.value = 0
    inputRefs.value[0]?.focus()
  }
}

function setInputRef(el: HTMLInputElement | null, index: number) {
  if (el) {
    inputRefs.value[index] = el
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <div class="logo">
        <img src="/icon-192.png" alt="myol" class="logo-icon" />
      </div>

      <p class="login-subtitle">パスワードを入力</p>

      <div class="pin-input-container" :class="{ 'has-error': error }">
        <input
          v-for="(_, index) in 4"
          :key="index"
          type="tel"
          inputmode="numeric"
          maxlength="1"
          class="pin-input"
          :class="{ filled: digits[index] }"
          :value="digits[index]"
          @input="handleInput(index, $event)"
          @keydown="handleKeydown(index, $event)"
          :ref="(el) => setInputRef(el as HTMLInputElement, index)"
        />
      </div>

      <p v-if="error" class="error-message">
        パスワードが違います
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
  max-width: 320px;
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
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.pin-input {
  width: 3.5rem;
  height: 4rem;
  text-align: center;
  font-size: 1.5rem;
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
