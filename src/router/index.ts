import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: '/login',
			name: 'login',
			component: () => import('@/pages/LoginPage.vue')
		},
		{
			path: '/',
			name: 'home',
			component: () => import('@/pages/SongListPage.vue'),
			meta: { requiresAuth: true }
		},
		{
			path: '/songs/new',
			name: 'song-new',
			component: () => import('@/pages/SongEditPage.vue'),
			meta: { requiresAuth: true }
		},
		{
			path: '/songs/:id',
			name: 'song-detail',
			component: () => import('@/pages/SongDetailPage.vue'),
			meta: { requiresAuth: true }
		},
		{
			path: '/songs/:id/edit',
			name: 'song-edit',
			component: () => import('@/pages/SongEditPage.vue'),
			meta: { requiresAuth: true }
		}
	]
})

router.beforeEach(async (to) => {
	const authStore = useAuthStore()
	const authenticated = await authStore.ensureAuthenticated()

	if (to.meta.requiresAuth && !authenticated) {
		return { name: 'login' }
	}

	if (to.name === 'login' && authenticated) {
		return { name: 'home' }
	}

	return true
})

export default router
