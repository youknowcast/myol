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

router.beforeEach((to, _from, next) => {
	const authStore = useAuthStore()

	if (to.meta.requiresAuth && !authStore.isAuthenticated) {
		next({ name: 'login' })
	} else if (to.name === 'login' && authStore.isAuthenticated) {
		next({ name: 'home' })
	} else {
		next()
	}
})

export default router
