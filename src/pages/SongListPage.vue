<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSongsStore } from '@/stores/songs'
import SongCard from '@/components/song/SongCard.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
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
    <ConfirmModal
      v-model:is-open="showDeleteConfirm"
      title="曲の削除"
      :message="`「${songToDelete?.title}」を削除しますか？\nこの操作は取り消せません。`"
      confirm-text="削除する"
      cancel-text="キャンセル"
      :danger="true"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
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
</style>
