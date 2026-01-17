import type { Ref } from 'vue'
import type { Router } from 'vue-router'

export interface UseSongDetailNavigationOptions {
	router: Router
	songId: Ref<string>
}

export function useSongDetailNavigation(options: UseSongDetailNavigationOptions) {
	function goBack() {
		options.router.push({ name: 'home' })
	}

	function goToEdit() {
		options.router.push({ name: 'song-edit', params: { id: options.songId.value } })
	}

	return {
		goBack,
		goToEdit
	}
}
