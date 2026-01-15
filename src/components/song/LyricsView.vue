<script setup lang="ts">
import type { Section, LyricsSection } from '@/lib/chordpro/types'

interface Props {
  section: Section
}

const props = defineProps<Props>()

const lyricsContent = props.section.content as LyricsSection
</script>

<template>
  <div class="lyrics-section">
    <div v-if="section.label" class="section-label">{{ section.label }}</div>

    <div class="lyrics-lines">
      <div
        v-for="(line, lineIndex) in lyricsContent.lines"
        :key="lineIndex"
        class="lyrics-line"
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

.lyrics-lines {
  line-height: 1.6;
}

.lyrics-line {
  margin-bottom: var(--spacing-md);
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

@media (min-width: 768px) {
  .lyrics-text-row {
    font-size: 1.25rem;
  }

  .lyrics-chord-row {
    font-size: 1rem;
  }
}
</style>
