import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useSongDetailNavigation } from './useSongDetailNavigation'

describe('useSongDetailNavigation', () => {
	it('navigates to home', () => {
		const push = vi.fn()
		const router = { push } as any
		const songId = ref('demo')
		const { goBack } = useSongDetailNavigation({ router, songId })

		goBack()
		expect(push).toHaveBeenCalledWith({ name: 'home' })
	})

	it('navigates to edit page', () => {
		const push = vi.fn()
		const router = { push } as any
		const songId = ref('song-123')
		const { goToEdit } = useSongDetailNavigation({ router, songId })

		goToEdit()
		expect(push).toHaveBeenCalledWith({ name: 'song-edit', params: { id: 'song-123' } })
	})
})
