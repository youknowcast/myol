<script setup lang="ts">
import { computed } from 'vue'
import { useLyricsHighlight } from '@/composables/useLyricsHighlight'
import type { Section, LyricsSection } from '@/lib/chordpro/types'

interface Props {
  section: Section
  currentMeasure?: number
  measureOffset?: number
  isPlaying?: boolean
}

interface Emits {
  (e: 'seek', value: number): void
}

const props = withDefaults(defineProps<Props>(), {
  currentMeasure: 0,
  measureOffset: 0,
  isPlaying: false
})

const emit = defineEmits<Emits>()

const lyricsContent = props.section.content as LyricsSection
const rowHeight = 60 // Estimated line height for lyrics

const { currentLineIndex, contentTransform } = useLyricsHighlight({
  linesCount: computed(() => lyricsContent.lines.length),
  currentMeasure: computed(() => props.currentMeasure),
  measureOffset: computed(() => props.measureOffset),
  isPlaying: computed(() => props.isPlaying),
  rowHeight
})
</script>

<template>
  <div class="lyrics-section" :class="{ 'karaoke-mode': isPlaying }">
    <div v-if="section.label && !isPlaying" class="section-label">{{ section.label }}</div>

    <div class="lyrics-container">
      <div class="lyrics-lines" :style="{ transform: contentTransform }">
      <div
        v-for="(line, lineIndex) in lyricsContent.lines"
        :key="lineIndex"
        class="lyrics-line"
        :class="{ 'current-line': lineIndex === currentLineIndex }"
        @click="emit('seek', lineIndex + measureOffset)"
      >
        <!-- Chord row -->
        <div class="lyrics-chord-row">
          <template v-for="(segment, segIndex) in line.segments" :key="segIndex">
            <span v-if="segment.chord" class="chord">{{ segment.chord }}</span>
            <span v-else class="chord-space">&nbsp;</span>
            <span class="chord-spacer" :style="{ width: `${segment.text.length}ch` }"></span>
          </template>
        </div>

        <!-- Lyrics row -->
        <div class="lyrics-text-row">
          <template v-for="(segment, segIndex) in line.segments" :key="segIndex">
            <span>{{ segment.text }}</span>
          </template>
        </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lyrics-section {
  margin-bottom: var(--spacing-xl);
}

.section-label {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--spacing-sm);
  padding-bottom: var(--spacing-xs);
  border-bottom: 1px solid var(--color-border);
}

.lyrics-container {
  position: relative;
  overflow: hidden;
  height: 360px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: var(--radius-lg);
}

.karaoke-mode .lyrics-container {
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 20%,
    black 80%,
    transparent 100%
  );
}

.lyrics-lines {
  line-height: 1.6;
  transition: transform 0.4s cubic-bezier(0.2, 0, 0.2, 1);
  padding: 20px;
}

.karaoke-mode .lyrics-lines {
  padding-top: 150px;
  padding-bottom: 210px;
}

.lyrics-line {
  margin-bottom: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  height: 60px; /* Fixed height to match rowHeight in script */
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  cursor: pointer;
}

.lyrics-line.current-line {
  background: rgba(99, 102, 241, 0.15);
  border-left: 3px solid var(--color-primary);
}

.lyrics-chord-row {
  display: flex;
  flex-wrap: wrap;
  min-height: 1.4em;
  font-family: var(--font-mono);
  font-size: 0.9rem;
}

.chord {
  color: var(--color-chord);
  font-weight: 600;
  position: relative;
}

.current-line .chord {
  color: var(--color-primary);
}

.chord-space {
  visibility: hidden;
}

.chord-spacer {
  display: inline-block;
}

.lyrics-text-row {
  font-size: 1.1rem;
  color: var(--color-text);
}

.current-line .lyrics-text-row {
  font-weight: 500;
}

@media (min-width: 768px) {
  .lyrics-text-row {
    font-size: 1.25rem;
  }

  .lyrics-chord-row {
    font-size: 1rem;
  }
}
</style>
