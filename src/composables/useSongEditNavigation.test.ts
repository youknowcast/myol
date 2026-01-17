import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useSongEditNavigation } from './useSongEditNavigation'

describe('useSongEditNavigation', () => {
	it('navigates to home for new songs', () => {
		const push = vi.fn()
		const router = { push } as any
		const { goBack } = useSongEditNavigation({
			router,
			isNew: ref(true),
			songId: ref(undefined)
		})

		goBack()
		expect(push).toHaveBeenCalledWith({ name: 'home' })
	})

	it('navigates to detail for existing song', () => {
		const push = vi.fn()
		const router = { push } as any
		const { goBack } = useSongEditNavigation({
			router,
			isNew: ref(false),
			songId: ref('song-1')
		})

		goBack()
		expect(push).toHaveBeenCalledWith({ name: 'song-detail', params: { id: 'song-1' } })
	})
})
