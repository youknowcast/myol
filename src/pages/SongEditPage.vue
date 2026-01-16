<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSongsStore } from '@/stores/songs'
import { useChordProEditorStore } from '@/stores/chordproEditor'
import { autoAssignMeasures, generateChordPro, parseChordPro } from '@/lib/chordpro/parser'
import type { GridSection } from '@/lib/chordpro/types'
import GridEditor from '@/components/song/GridEditor.vue'

const route = useRoute()
const router = useRouter()
const songsStore = useSongsStore()
const editorStore = useChordProEditorStore()

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
      // Load into editor store
      editorStore.loadDocument(content.value)
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
    editorStore.loadDocument(content.value)
  }
})

// Flag to prevent infinite loop in bidirectional sync
let isSyncingFromStore = false
let isSyncingToStore = false

// Sync content changes to editor store (only if not syncing from store)
watch(content, (newContent) => {
  if (isSyncingFromStore) return
  isSyncingToStore = true
  editorStore.loadDocument(newContent)
  isSyncingToStore = false
})

// Sync editor store changes back to content (only if not syncing to store)
watch(() => editorStore.document, () => {
  if (isSyncingToStore) return
  if (editorStore.document) {
    const serialized = editorStore.serialize()
    if (serialized !== content.value) {
      isSyncingFromStore = true
      content.value = serialized
      isSyncingFromStore = false
    }
  }
}, { deep: true })

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
    editorStore.markAsSaved()
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

// Parse time signature to get beats per measure
function getBeatsPerMeasure(): number {
  const parts = time.value.split('/')
  return parseInt(parts[0] || '4', 10) || 4
}

// Auto-assign measures to chord-only content
function autoAssignMeasuresToContent() {
  // Parse current content
  const parsed = parseChordPro(content.value)

  // Apply auto-assign measures
  const beatsPerMeasure = getBeatsPerMeasure()
  const processed = autoAssignMeasures(parsed, beatsPerMeasure)

  // Update content with new ChordPro
  content.value = generateChordPro(processed)
}

// Edit mode: 'text' or 'visual'
type EditMode = 'text' | 'visual'
const editMode = ref<EditMode>('text')

// Use editor store for grid sections
const gridSections = computed(() => editorStore.gridSections)

// Update grid section through store
function updateGridSection(sectionIndex: number) {
  editorStore.selectSection(sectionIndex)
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
          <div class="form-label-row">
            <label for="content">ChordPro</label>
            <div class="edit-mode-toggle">
              <button
                type="button"
                class="mode-btn"
                :class="{ active: editMode === 'text' }"
                @click="editMode = 'text'"
              >
                テキスト
              </button>
              <button
                type="button"
                class="mode-btn"
                :class="{ active: editMode === 'visual' }"
                @click="editMode = 'visual'"
              >
                ビジュアル
              </button>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="autoAssignMeasuresToContent"
              title="コードのみの行を検出し、拍子に基づいて小節を自動割り振りします"
            >
              🎵 小節を自動割り振り
            </button>
          </div>

          <!-- Visual Editor -->
          <div v-if="editMode === 'visual'" class="visual-editor">
            <div v-if="gridSections.length === 0" class="no-grids-message">
              Gridセクションがありません。「小節を自動割り振り」を使ってコードをGridに変換してください。
            </div>
            <div v-for="{ section, index } in gridSections" :key="index" class="grid-editor-wrapper">
              <div class="grid-section-label">{{ section.label || 'Grid ' + (index + 1) }}</div>
              <GridEditor
                :model-value="(section.content as GridSection)"
                :beats-per-measure="getBeatsPerMeasure()"
                :lyrics-hints="(section.content as GridSection).lyricsHints"
                @update:model-value="() => updateGridSection(index)"
              />
            </div>
          </div>

          <!-- Text Editor -->
          <textarea
            v-show="editMode === 'text'"
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

.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xs);
}

.btn-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg-card);
  border-color: var(--color-primary);
}

.btn-sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.75rem;
}

.edit-mode-toggle {
  display: flex;
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: 2px;
}

.mode-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  border: none;
  background: transparent;
  cursor: pointer;
}

.mode-btn.active {
  background: var(--color-primary);
  color: white;
}

.mode-btn:hover:not(.active) {
  background: var(--color-bg-secondary);
}

.visual-editor {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  min-height: 300px;
}

.no-grids-message {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--spacing-xl);
}

.grid-editor-wrapper {
  margin-bottom: var(--spacing-md);
}

.grid-section-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--spacing-xs);
}

@media (min-width: 768px) {
  .form-textarea {
    min-height: 500px;
  }

  .visual-editor {
    min-height: 400px;
  }
}
</style>
