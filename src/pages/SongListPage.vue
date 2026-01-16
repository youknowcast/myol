<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSongsStore } from '@/stores/songs'
import SongCard from '@/components/song/SongCard.vue'
import type { SongMeta } from '@/lib/chordpro/types'

const router = useRouter()
const songsStore = useSongsStore()

const songs = computed(() => songsStore.sortedSongs)
const loading = computed(() => songsStore.loading)
const deleting = ref(false)

// Delete confirm state
const showDeleteConfirm = ref(false)
const songToDelete = ref<SongMeta | null>(null)

onMounted(() => {
  songsStore.fetchSongs()
})

function goToNewSong() {
  router.push({ name: 'song-new' })
}

function goToSong(id: string) {
  router.push({ name: 'song-detail', params: { id } })
}

function handleDelete(id: string) {
  const song = songs.value.find(s => s.id === id)
  if (!song) return

  songToDelete.value = song
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!songToDelete.value) return

  try {
    deleting.value = true
    await songsStore.removeSong(songToDelete.value.id)
    showDeleteConfirm.value = false
    songToDelete.value = null
  } catch (e) {
    alert('削除に失敗しました: ' + (e instanceof Error ? e.message : '不明なエラー'))
  } finally {
    deleting.value = false
  }
}

function cancelDelete() {
  showDeleteConfirm.value = false
  songToDelete.value = null
}
</script>

<template>
  <div class="song-list-page">
    <header class="header">
      <h1 class="header-title">
        <span>🎸</span>
        <span>myol</span>
      </h1>
      <div class="header-actions">
        <button class="btn btn-primary" @click="goToNewSong">
          <span>＋</span>
          <span class="btn-text">追加</span>
        </button>
      </div>
    </header>

    <main class="song-list-content">
      <div v-if="loading" class="loading-state">
        <p>読み込み中...</p>
      </div>

      <div v-else-if="songs.length === 0" class="empty-state">
        <p class="empty-icon">🎵</p>
        <p class="empty-text">曲がありません</p>
        <button class="btn btn-primary" @click="goToNewSong">
          最初の曲を追加
        </button>
      </div>

      <div v-else class="song-grid">
        <SongCard
          v-for="song in songs"
          :key="song.id"
          :song="song"
          @click="goToSong(song.id)"
          @delete="handleDelete"
        />
      </div>
    </main>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal">
        <h3 class="modal-title">曲の削除</h3>
        <p class="modal-message">
          「{{ songToDelete?.title }}」を削除しますか？<br>
          この操作は取り消せません。
        </p>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="cancelDelete" :disabled="deleting">
            キャンセル
          </button>
          <button class="btn btn-danger" @click="confirmDelete" :disabled="deleting">
            {{ deleting ? '削除中...' : '削除する' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.song-list-page {
  min-height: 100vh;
  background: var(--color-bg);
}

.song-list-content {
  padding: var(--spacing-md);
  max-width: 1200px;
  margin: 0 auto;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  text-align: center;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: var(--spacing-md);
}

.empty-text {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

.song-grid {
  display: grid;
  gap: var(--spacing-md);
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .song-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .btn-text {
    display: inline;
  }
}

@media (min-width: 1024px) {
  .song-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.btn-text {
  display: none;
}

@media (min-width: 768px) {
  .btn-text {
    display: inline;
  }
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease-out;
}

.modal {
  background: var(--color-bg-card);
  padding: var(--spacing-lg);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 400px;
  border: 1px solid var(--color-border);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
  transform-origin: center;
  animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: var(--spacing-md);
  color: var(--color-text);
}

.modal-message {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

.btn-danger {
  background: var(--color-error);
  color: white;
  border: none;
}

.btn-danger:hover {
  background: #dc2626; /* Darker red */
}

.btn-danger:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes popIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
