<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSongsStore } from '@/stores/songs'
import { extractUniqueChords } from '@/lib/chords/dictionary'
import { usePlaybackState } from '@/composables/usePlaybackState'
import { useChordProDocument } from '@/composables/useChordProDocument'
import type { GridSection } from '@/lib/chordpro/types'
import LyricsView from '@/components/song/LyricsView.vue'
import GridView from '@/components/song/GridView.vue'
import SongKaraokeView from '@/components/song/SongKaraokeView.vue'
import ChordDiagram from '@/components/chord/ChordDiagram.vue'
import SpeedControl from '@/components/player/SpeedControl.vue'

const route = useRoute()
const router = useRouter()
const songsStore = useSongsStore()

const songId = computed(() => route.params.id as string)
const song = computed(() => songsStore.currentSong)
const loading = computed(() => songsStore.loading)

const songContent = computed(() => song.value?.content ?? '')
const { parsedSong, beatsPerMeasure, totalMeasures, sectionMeasureOffsets, karaokeRows } = useChordProDocument({
  content: songContent
})

const uniqueChords = computed(() => {
  if (!parsedSong.value) return []
  return extractUniqueChords(parsedSong.value.sections)
})

function getGridMeasureHints(grid: GridSection): string[] {
  if (!grid.measures || grid.measures.length === 0) {
    return []
  }
  return grid.measures.map(measure => measure.lyricsHint ?? '')
}

// View mode
type ViewMode = 'lyrics' | 'grid'
const viewMode = ref<ViewMode>('lyrics')

// Playback state (using composable)
const playback = usePlaybackState()
const contentRef = ref<HTMLElement | null>(null)

// Sync config from parsed song
watch([parsedSong, totalMeasures, beatsPerMeasure], () => {
  if (parsedSong.value) {
    playback.tempo.value = parsedSong.value.tempo || 80
    playback.beatsPerMeasure.value = beatsPerMeasure.value
  }
  playback.totalMeasures.value = totalMeasures.value
}, { immediate: true })

// Expose for template and child components
const isPlaying = playback.isPlaying
const currentTime = playback.currentTime
const currentMeasure = playback.currentMeasure
const progress = playback.progress
const totalDuration = playback.totalDuration
const speedMultiplier = playback.speedMultiplier

// Provide current measure to child components
provide('currentMeasure', currentMeasure)
provide('isPlaying', isPlaying)

// Format time as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function togglePlay() {
  playback.togglePlay()
}

function handleSpeedChange(speed: number) {
  playback.setSpeed(speed)
}

// Auto-scroll when playing
watch([isPlaying, progress], () => {
  if (isPlaying.value && contentRef.value) {
    const scrollable = contentRef.value
    const maxScroll = scrollable.scrollHeight - scrollable.clientHeight
    if (maxScroll > 0) {
      const targetScroll = progress.value * maxScroll
      scrollable.scrollTop = targetScroll
    }
  }
})

// Seek to position
function handleSeek(event: MouseEvent | TouchEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clientX = 'touches' in event ? event.touches[0]!.clientX : event.clientX
  const x = clientX - rect.left
  const percentage = Math.max(0, Math.min(1, x / rect.width))

  playback.seek(percentage * totalDuration.value)

  // Also scroll to position
  if (contentRef.value) {
    const scrollable = contentRef.value
    const maxScroll = scrollable.scrollHeight - scrollable.clientHeight
    scrollable.scrollTop = percentage * maxScroll
  }
}

function handleScroll() {
  if (!contentRef.value || isPlaying.value) return
  const scrollable = contentRef.value
  const maxScroll = scrollable.scrollHeight - scrollable.clientHeight
  if (maxScroll > 0) {
    const scrollProgress = scrollable.scrollTop / maxScroll
    playback.seek(scrollProgress * totalDuration.value)
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
  playback.dispose()
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

          <!-- View mode selector -->
          <div class="view-selector">
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

          <!-- Song sections (Unified Karaoke View when playing) -->
          <div v-if="isPlaying" class="song-sections-karaoke">
            <SongKaraokeView
              v-if="parsedSong"
              :rows="karaokeRows"
              :currentMeasure="currentMeasure"
              :isPlaying="isPlaying"
              :viewMode="viewMode"
            />
          </div>

          <!-- Song sections (Static View when stopped) -->
          <div v-else class="song-sections">
            <template v-for="(section, index) in parsedSong.sections" :key="index">
              <!-- Grid sections -->
              <GridView
                v-if="section.content.kind === 'grid' && viewMode === 'grid'"
                :section="section"
                :currentMeasure="currentMeasure"
                :measureOffset="sectionMeasureOffsets[index] || 0"
                :isPlaying="false"
              />

              <!-- Grid section lyrics hints (shown in lyrics mode as well if needed, but per user request, Grid covers it) -->
              <div
                v-if="section.content.kind === 'grid' && viewMode === 'lyrics' && getGridMeasureHints(section.content as GridSection).length"
                class="grid-lyrics-section"
              >
                <div v-if="section.label" class="section-label">{{ section.label }}</div>
                <div
                  v-for="(hint, hintIndex) in getGridMeasureHints(section.content as GridSection)"
                  :key="hintIndex"
                  class="lyrics-hint-line"
                  :class="{ 'current-line': hintIndex === (currentMeasure - (sectionMeasureOffsets[index] || 0)) }"
                >
                  {{ hint }}
                </div>
              </div>

              <!-- Lyrics sections -->
              <LyricsView
                v-if="section.content.kind === 'lyrics' && viewMode === 'lyrics'"
                :section="section"
                :currentMeasure="currentMeasure"
                :measureOffset="sectionMeasureOffsets[index] || 0"
                :isPlaying="false"
              />

              <!-- Tab sections (already handles tab mode separately) -->
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
        <!-- Time display and seek bar -->
        <div class="time-bar">
          <span class="time-display">{{ formatTime(currentTime) }}</span>
          <div
            class="seek-bar"
            @click="handleSeek"
            @touchstart.prevent="handleSeek"
          >
            <div class="seek-bar-fill" :style="{ width: `${progress * 100}%` }"></div>
            <div class="seek-bar-thumb" :style="{ left: `${progress * 100}%` }"></div>
          </div>
          <span class="time-display">{{ formatTime(totalDuration) }}</span>
        </div>

        <!-- Measure indicator -->
        <div class="measure-indicator">
          <span class="measure-label">小節:</span>
          <span class="measure-current">{{ currentMeasure + 1 }}</span>
          <span class="measure-separator">/</span>
          <span class="measure-total">{{ totalMeasures }}</span>
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
  padding: var(--spacing-sm) var(--spacing-md);
}

.time-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.time-display {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  min-width: 3rem;
}

.time-display:last-child {
  text-align: right;
}

.seek-bar {
  flex: 1;
  height: 8px;
  background: var(--color-bg-card);
  border-radius: var(--radius-full);
  position: relative;
  cursor: pointer;
}

.seek-bar-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width 0.1s linear;
}

.seek-bar-thumb {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  background: var(--color-primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.measure-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
}

.measure-label {
  color: var(--color-text-muted);
}

.measure-current {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-accent);
  font-size: 0.875rem;
}

.measure-separator {
  color: var(--color-text-muted);
}

.measure-total {
  font-family: var(--font-mono);
}

.grid-lyrics-section {
  margin-bottom: var(--spacing-xl);
}

.lyrics-hint-line {
  padding: var(--spacing-sm) 0;
  font-size: 1rem;
  line-height: 1.8;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  transition: all var(--transition-fast);
}

.lyrics-hint-line:last-child {
  border-bottom: none;
}

.lyrics-hint-line.current-line {
  background: var(--color-primary);
  color: white;
  padding-left: var(--spacing-md);
  padding-right: var(--spacing-md);
  margin: 0 calc(-1 * var(--spacing-md));
  border-radius: var(--radius-sm);
}
</style>
