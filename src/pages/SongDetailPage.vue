<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSongsStore } from '@/stores/songs'
import { parseChordPro } from '@/lib/chordpro/parser'
import { extractUniqueChords } from '@/lib/chords/dictionary'
import LyricsView from '@/components/song/LyricsView.vue'
import GridView from '@/components/song/GridView.vue'
import ChordDiagram from '@/components/chord/ChordDiagram.vue'
import SpeedControl from '@/components/player/SpeedControl.vue'

const route = useRoute()
const router = useRouter()
const songsStore = useSongsStore()

const songId = computed(() => route.params.id as string)
const song = computed(() => songsStore.currentSong)
const loading = computed(() => songsStore.loading)

const parsedSong = computed(() => {
  if (!song.value) return null
  return parseChordPro(song.value.content)
})

const uniqueChords = computed(() => {
  if (!parsedSong.value) return []
  return extractUniqueChords(parsedSong.value.sections)
})

// View mode
type ViewMode = 'lyrics' | 'grid' | 'mixed'
const viewMode = ref<ViewMode>('lyrics')

// Auto-scroll
const isPlaying = ref(false)
const speedMultiplier = ref(1)
const scrollProgress = ref(0)
const contentRef = ref<HTMLElement | null>(null)
let scrollInterval: ReturnType<typeof setInterval> | null = null

const tempo = computed(() => parsedSong.value?.tempo || 80)
const timeSignature = computed(() => {
  const time = parsedSong.value?.time ?? '4/4'
  const parts = time.split('/')
  return { beats: parseInt(parts[0] ?? '4', 10) || 4, noteValue: parseInt(parts[1] ?? '4', 10) || 4 }
})

// Calculate scroll speed based on tempo
const scrollSpeedPx = computed(() => {
  // Base: 1 measure = visible height / 8 measures (show 8 measures at a time)
  // Time per measure = (60 / tempo) * beats
  const msPerMeasure = (60 / tempo.value) * timeSignature.value.beats * 1000
  const pxPerMeasure = 60 // approximate pixels per measure line
  return (pxPerMeasure / msPerMeasure) * speedMultiplier.value * 16 // 16ms per frame
})

function togglePlay() {
  isPlaying.value = !isPlaying.value
}

function handleSpeedChange(speed: number) {
  speedMultiplier.value = speed
}

function startAutoScroll() {
  if (scrollInterval) return

  scrollInterval = setInterval(() => {
    if (!contentRef.value) return

    const scrollable = contentRef.value
    const maxScroll = scrollable.scrollHeight - scrollable.clientHeight

    if (maxScroll <= 0) return

    const newScroll = scrollable.scrollTop + scrollSpeedPx.value
    scrollable.scrollTop = newScroll
    scrollProgress.value = Math.min(newScroll / maxScroll, 1)

    if (newScroll >= maxScroll) {
      isPlaying.value = false
    }
  }, 16)
}

function stopAutoScroll() {
  if (scrollInterval) {
    clearInterval(scrollInterval)
    scrollInterval = null
  }
}

watch(isPlaying, (playing) => {
  if (playing) {
    startAutoScroll()
  } else {
    stopAutoScroll()
  }
})

function handleScroll() {
  if (!contentRef.value || isPlaying.value) return
  const scrollable = contentRef.value
  const maxScroll = scrollable.scrollHeight - scrollable.clientHeight
  if (maxScroll > 0) {
    scrollProgress.value = scrollable.scrollTop / maxScroll
  }
}

function goBack() {
  router.push({ name: 'home' })
}

function goToEdit() {
  router.push({ name: 'song-edit', params: { id: songId.value } })
}

onMounted(() => {
  songsStore.fetchSong(songId.value)
})

onUnmounted(() => {
  stopAutoScroll()
})
</script>

<template>
  <div class="song-detail-page">
    <header class="header">
      <button class="btn btn-ghost btn-icon" @click="goBack" aria-label="戻る">
        ←
      </button>
      <h1 class="header-title">{{ song?.title || '読み込み中...' }}</h1>
      <div class="header-actions">
        <button class="btn btn-ghost btn-icon" @click="goToEdit" aria-label="編集">
          ✏️
        </button>
        <button
          class="btn btn-icon"
          :class="isPlaying ? 'btn-primary' : 'btn-ghost'"
          @click="togglePlay"
          :aria-label="isPlaying ? '停止' : '再生'"
        >
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="loading-state">
      <p>読み込み中...</p>
    </div>

    <template v-else-if="parsedSong">
      <!-- Song metadata -->
      <div class="song-meta-bar">
        <div class="song-meta">
          <span class="song-meta-item" v-if="parsedSong.artist">
            {{ parsedSong.artist }}
          </span>
          <span class="song-meta-item" v-if="parsedSong.key">
            <span class="song-meta-label">Key:</span> {{ parsedSong.key }}
          </span>
          <span class="song-meta-item" v-if="parsedSong.capo">
            <span class="song-meta-label">Capo:</span> {{ parsedSong.capo }}
          </span>
          <span class="song-meta-item" v-if="parsedSong.tempo">
            <span class="song-meta-label">♩=</span>{{ parsedSong.tempo }}
          </span>
          <span class="song-meta-item" v-if="parsedSong.time">
            {{ parsedSong.time }}
          </span>
        </div>

        <div class="view-mode-toggle">
          <button
            class="mode-btn"
            :class="{ active: viewMode === 'lyrics' }"
            @click="viewMode = 'lyrics'"
          >
            歌詞
          </button>
          <button
            class="mode-btn"
            :class="{ active: viewMode === 'grid' }"
            @click="viewMode = 'grid'"
          >
            Grid
          </button>
          <button
            class="mode-btn"
            :class="{ active: viewMode === 'mixed' }"
            @click="viewMode = 'mixed'"
          >
            両方
          </button>
        </div>
      </div>

      <!-- Main content -->
      <div class="song-content-wrapper">
        <main
          ref="contentRef"
          class="song-content"
          @scroll="handleScroll"
          @click="isPlaying && togglePlay()"
        >
          <!-- Chord diagrams (tablet/desktop) -->
          <aside class="chord-diagrams-sidebar" v-if="uniqueChords.length > 0">
            <div class="chord-diagrams-grid">
              <ChordDiagram
                v-for="chord in uniqueChords"
                :key="chord"
                :chord="chord"
              />
            </div>
          </aside>

          <!-- Song sections -->
          <div class="song-sections">
            <template v-for="(section, index) in parsedSong.sections" :key="index">
              <!-- Grid sections -->
              <GridView
                v-if="section.content.kind === 'grid' && (viewMode === 'grid' || viewMode === 'mixed')"
                :section="section"
              />

              <!-- Lyrics sections -->
              <LyricsView
                v-if="section.content.kind === 'lyrics' && (viewMode === 'lyrics' || viewMode === 'mixed')"
                :section="section"
              />

              <!-- Tab sections -->
              <div
                v-if="section.content.kind === 'tab'"
                class="tab-section"
              >
                <div v-if="section.label" class="section-label">{{ section.label }}</div>
                <pre class="tab-content">{{ section.content.lines.join('\n') }}</pre>
              </div>
            </template>
          </div>
        </main>

        <!-- Chord diagrams (mobile - bottom drawer) -->
        <div class="chord-diagrams-mobile" v-if="uniqueChords.length > 0">
          <div class="chord-diagrams-scroll">
            <ChordDiagram
              v-for="chord in uniqueChords"
              :key="chord"
              :chord="chord"
              size="small"
            />
          </div>
        </div>
      </div>

      <!-- Player controls -->
      <footer class="player-bar">
        <div class="progress-bar">
          <div class="progress-bar-fill" :style="{ width: `${scrollProgress * 100}%` }"></div>
        </div>
        <SpeedControl
          :speed="speedMultiplier"
          :is-playing="isPlaying"
          @update:speed="handleSpeedChange"
          @toggle-play="togglePlay"
        />
      </footer>
    </template>
  </div>
</template>

<style scoped>
.song-detail-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
}

.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.song-meta-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.view-mode-toggle {
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
}

.mode-btn.active {
  background: var(--color-primary);
  color: white;
}

.song-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.song-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  display: flex;
  gap: var(--spacing-lg);
}

.chord-diagrams-sidebar {
  display: none;
}

@media (min-width: 1024px) {
  .chord-diagrams-sidebar {
    display: block;
    width: 200px;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }

  .chord-diagrams-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }

  .chord-diagrams-mobile {
    display: none;
  }
}

.chord-diagrams-mobile {
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  padding: var(--spacing-sm);
}

.chord-diagrams-scroll {
  display: flex;
  gap: var(--spacing-sm);
  overflow-x: auto;
  padding-bottom: var(--spacing-xs);
}

.song-sections {
  flex: 1;
  min-width: 0;
}

.tab-section {
  margin-bottom: var(--spacing-lg);
}

.section-label {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--spacing-sm);
}

.tab-content {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  background: var(--color-bg-secondary);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  overflow-x: auto;
  white-space: pre;
  line-height: 1.4;
}

.player-bar {
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  padding: var(--spacing-xs) var(--spacing-md) var(--spacing-sm);
}

.player-bar .progress-bar {
  margin-bottom: var(--spacing-sm);
}
</style>
