import type { Ref } from 'vue'
import type { Router } from 'vue-router'

export interface UseSongEditNavigationOptions {
	router: Router
	isNew: Ref<boolean>
	songId: Ref<string | undefined>
}

export function useSongEditNavigation(options: UseSongEditNavigationOptions) {
	function goBack() {
		if (options.isNew.value) {
			options.router.push({ name: 'home' })
			return
		}
		options.router.push({ name: 'song-detail', params: { id: options.songId.value } })
	}

	return {
		goBack
	}
}
