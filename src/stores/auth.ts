import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const AUTH_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD || '0000'
const AUTH_KEY = 'myol_authenticated'

export const useAuthStore = defineStore('auth', () => {
	const authenticated = ref(localStorage.getItem(AUTH_KEY) === 'true')

	const isAuthenticated = computed(() => authenticated.value)

	function login(password: string): boolean {
		if (password === AUTH_PASSWORD) {
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
