<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSongsStore } from '@/stores/songs'

const route = useRoute()
const router = useRouter()
const songsStore = useSongsStore()

const isNew = computed(() => route.name === 'song-new')
const songId = computed(() => route.params.id as string | undefined)

const title = ref('')
const artist = ref('')
const key = ref('')
const capo = ref(0)
const tempo = ref(120)
const time = ref('4/4')
const content = ref('')

const saving = ref(false)

onMounted(async () => {
  if (!isNew.value && songId.value) {
    await songsStore.fetchSong(songId.value)
    if (songsStore.currentSong) {
      title.value = songsStore.currentSong.title
      artist.value = songsStore.currentSong.artist
      key.value = songsStore.currentSong.key || ''
      capo.value = songsStore.currentSong.capo || 0
      tempo.value = songsStore.currentSong.tempo || 120
      time.value = songsStore.currentSong.time || '4/4'
      content.value = songsStore.currentSong.content
    }
  } else {
    // Default template for new song
    content.value = `{title: }
{artist: }
{key: C}
{tempo: 120}
{time: 4/4}

{start_of_verse label="Verse 1"}
[C]歌詞を[G]入力して[Am]ください
{end_of_verse}

{start_of_grid label="Chord Progression" shape="4x4"}
|| C . . . | G . . . | Am . . . | F . . . ||
{end_of_grid}
`
  }
})

async function save() {
  saving.value = true
  try {
    const song = {
      id: songId.value || generateId(),
      title: title.value || 'Untitled',
      artist: artist.value,
      key: key.value,
      capo: capo.value,
      tempo: tempo.value,
      time: time.value,
      content: content.value
    }

    await songsStore.saveSong(song)
    router.push({ name: 'song-detail', params: { id: song.id } })
  } finally {
    saving.value = false
  }
}

function generateId(): string {
  return `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function goBack() {
  if (isNew.value) {
    router.push({ name: 'home' })
  } else {
    router.push({ name: 'song-detail', params: { id: songId.value } })
  }
}
</script>

<template>
  <div class="song-edit-page">
    <header class="header">
      <button class="btn btn-ghost btn-icon" @click="goBack" aria-label="戻る">
        ←
      </button>
      <h1 class="header-title">{{ isNew ? '新規作成' : '編集' }}</h1>
      <div class="header-actions">
        <button
          class="btn btn-primary"
          @click="save"
          :disabled="saving"
        >
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </header>

    <main class="edit-content">
      <div class="edit-form">
        <div class="form-row">
          <div class="form-group">
            <label for="title">タイトル</label>
            <input
              id="title"
              v-model="title"
              type="text"
              placeholder="曲名"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label for="artist">アーティスト</label>
            <input
              id="artist"
              v-model="artist"
              type="text"
              placeholder="アーティスト名"
              class="form-input"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group form-group-small">
            <label for="key">キー</label>
            <input
              id="key"
              v-model="key"
              type="text"
              placeholder="C"
              class="form-input"
            />
          </div>
          <div class="form-group form-group-small">
            <label for="capo">カポ</label>
            <input
              id="capo"
              v-model.number="capo"
              type="number"
              min="0"
              max="12"
              class="form-input"
            />
          </div>
          <div class="form-group form-group-small">
            <label for="tempo">テンポ</label>
            <input
              id="tempo"
              v-model.number="tempo"
              type="number"
              min="40"
              max="240"
              class="form-input"
            />
          </div>
          <div class="form-group form-group-small">
            <label for="time">拍子</label>
            <input
              id="time"
              v-model="time"
              type="text"
              placeholder="4/4"
              class="form-input"
            />
          </div>
        </div>

        <div class="form-group form-group-full">
          <label for="content">ChordPro</label>
          <textarea
            id="content"
            v-model="content"
            class="form-textarea"
            placeholder="ChordPro形式で入力..."
            rows="20"
          ></textarea>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.song-edit-page {
  min-height: 100vh;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}

.edit-content {
  flex: 1;
  padding: var(--spacing-md);
  max-width: 1000px;
  margin: 0 auto;
  width: 100%;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.form-group {
  flex: 1;
  min-width: 200px;
}

.form-group-small {
  flex: 0 1 100px;
  min-width: 80px;
}

.form-group-full {
  width: 100%;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}

.form-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 1rem;
  transition: border-color var(--transition-fast);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-textarea {
  width: 100%;
  padding: var(--spacing-md);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.9rem;
  line-height: 1.5;
  resize: vertical;
  min-height: 300px;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

@media (min-width: 768px) {
  .form-textarea {
    min-height: 500px;
  }
}
</style>
