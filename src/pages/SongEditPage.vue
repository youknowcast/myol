<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSongsStore } from '@/stores/songs'
import { useChordProEditorStore } from '@/stores/chordproEditor'
import { useBeatSignature } from '@/composables/useBeatSignature'
import { useChordProDocument } from '@/composables/useChordProDocument'
import { useChordProEditorSync } from '@/composables/useChordProEditorSync'
import { useSongEditForm } from '@/composables/useSongEditForm'
import { useGridSectionManager } from '@/composables/useGridSectionManager'
import { useSongEditNavigation } from '@/composables/useSongEditNavigation'
import type { GridSection } from '@/lib/chordpro/types'
import GridEditor from '@/components/song/GridEditor.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

const route = useRoute()
const router = useRouter()
const songsStore = useSongsStore()
const editorStore = useChordProEditorStore()

const isNew = computed(() => route.name === 'song-new')
const songId = computed(() => route.params.id as string | undefined)

const {
  title,
  artist,
  key,
  capo,
  tempo,
  time,
  content,
  saving,
  loadSong,
  save: saveSong
} = useSongEditForm({
  isNew,
  songId,
  songsStore,
  initialTemplate: `{title: }
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
})

const { autoAssignMeasuresToContent } = useChordProDocument({ content })
const { beatsPerMeasure } = useBeatSignature(time)

useChordProEditorSync({ content, editorStore })

onMounted(async () => {
  await loadSong()
})

async function save() {
  const song = await saveSong()
  if (song) {
    editorStore.markAsSaved()
    router.push({ name: 'song-detail', params: { id: song.id } })
  }
}

const { goBack } = useSongEditNavigation({
  router,
  isNew,
  songId
})

function handleAutoAssignMeasures() {
  autoAssignMeasuresToContent(beatsPerMeasure.value)
}


// Edit mode: 'text' or 'visual'
type EditMode = 'text' | 'visual'
const editMode = ref<EditMode>('visual')

const {
  gridSections,
  updateGridSection,
  updateLabel,
  addSection,
  removeSection,
  moveSection,
  splitSection,
  canSplit,
  setSelectedMeasure
} = useGridSectionManager(editorStore)

const isLabelDialogOpen = ref(false)
const labelDraft = ref('')
const labelTargetIndex = ref<number | null>(null)

function openLabelDialog(index: number, currentLabel: string) {
  labelDraft.value = currentLabel
  labelTargetIndex.value = index
  isLabelDialogOpen.value = true
}

function closeLabelDialog() {
  isLabelDialogOpen.value = false
  labelDraft.value = ''
  labelTargetIndex.value = null
}

function commitLabelDialog() {
  if (labelTargetIndex.value === null) return
  updateLabel(labelTargetIndex.value, labelDraft.value)
  closeLabelDialog()
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
      <ConfirmModal
        :is-open="isLabelDialogOpen"
        title="Section名を編集"
        message=""
        confirm-text="保存"
        cancel-text="キャンセル"
        @confirm="commitLabelDialog"
        @cancel="closeLabelDialog"
        @update:isOpen="(val) => { if (!val) closeLabelDialog() }"
      >
        <template #message>
          <input
            v-model="labelDraft"
            type="text"
            class="form-input"
            placeholder="Section名"
            @keydown.enter.prevent="commitLabelDialog"
          />
        </template>
      </ConfirmModal>
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
                :class="{ active: editMode === 'visual' }"
                @click="editMode = 'visual'"
              >
                ビジュアル
              </button>
              <button
                type="button"
                class="mode-btn"
                :class="{ active: editMode === 'text' }"
                @click="editMode = 'text'"
              >
                テキスト(Professional)
              </button>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="handleAutoAssignMeasures"
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
            <div v-for="{ section, index, displayLabel } in gridSections" :key="index" class="grid-editor-wrapper">
              <div class="grid-section-header">
                <div class="grid-section-title">
                  <span>{{ section.label ?? displayLabel }}</span>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    @click="openLabelDialog(index, section.label ?? '')"
                  >
                    編集
                  </button>
                </div>
                <div class="grid-section-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    @click="moveSection(index, 'up')"
                    :disabled="index === 0"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    @click="moveSection(index, 'down')"
                    :disabled="index === gridSections.length - 1"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    @click="addSection(index)"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    @click="splitSection(index)"
                    :disabled="!canSplit(index)"
                  >
                    分割
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    @click="removeSection(index)"
                    :disabled="gridSections.length <= 1"
                  >
                    削除
                  </button>
                </div>
              </div>
              <GridEditor
                :model-value="(section.content as GridSection)"
                @update:model-value="(val) => updateGridSection(index, val)"
                @select-measure="(val) => setSelectedMeasure(index, val)"
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

.grid-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.grid-section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-weight: 600;
  color: var(--color-text);
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
