<script setup lang="ts">
import { computed } from 'vue'
import { useKaraokeScroll } from '@/composables/useKaraokeScroll'
import { useGridCellDisplay } from '@/composables/useGridCellDisplay'
import { useGridCellHighlight } from '@/composables/useGridCellHighlight'
import type { GridCell } from '@/lib/chordpro/types'
import type { KaraokeRow } from '@/composables/useChordProDocument'

interface Props {
  rows: KaraokeRow[]
  currentMeasure: number
  isPlaying: boolean
  viewMode: 'lyrics' | 'grid'
}

const props = defineProps<Props>()

const rowHeight = 72
const containerHeight = 450

const karaokeRows = computed(() => props.rows)

const { activeRowIndex, contentTransform } = useKaraokeScroll({
  rows: karaokeRows,
  currentMeasure: computed(() => props.currentMeasure),
  isPlaying: computed(() => props.isPlaying),
  rowHeight,
  containerHeight
})

const { getCellDisplay } = useGridCellDisplay()
const { getKaraokeCellClass } = useGridCellHighlight()

function getCellClass(cell: GridCell, row: KaraokeRow): string[] {
  return getKaraokeCellClass(cell, {
    currentMeasure: props.currentMeasure,
    rowStartMeasure: row.startMeasure,
    rowEndMeasure: row.endMeasure
  })
}
</script>

<template>
  <div class="karaoke-view" :class="{ 'is-playing': isPlaying }">
    <div class="karaoke-container">
      <div
        class="karaoke-content"
        :style="{ transform: contentTransform }"
      >
        <div
          v-for="(row, idx) in karaokeRows"
          :key="idx"
          class="karaoke-row"
          :class="[
            `row-${row.type}`,
            { 'is-active': idx === activeRowIndex }
          ]"
        >
          <!-- Grid Row -->
          <template v-if="row.type === 'grid' && viewMode === 'grid'">
            <div class="grid-display">
              <div class="grid-cells">
                <span
                  v-for="(cell, cIdx) in row.content?.cells ?? []"
                  :key="cIdx"
                  class="cell"
                  :class="getCellClass(cell, row)"
                >
                  {{ getCellDisplay(cell) }}
                </span>
              </div>
              <div v-if="row.content?.hint" class="grid-hint">
                {{ row.content.hint }}
              </div>
            </div>
          </template>

          <!-- Lyrics Row -->
          <template v-if="row.type === 'lyrics' && viewMode === 'lyrics'">
            <div class="lyrics-display">
              <div class="lyrics-chords">
                <template v-for="(seg, sIdx) in row.content?.segments ?? []" :key="sIdx">
                  <span v-if="seg.chord" class="chord">{{ seg.chord }}</span>
                  <span v-else class="chord-space">&nbsp;</span>
                  <span class="chord-spacer" :style="{ width: `${seg.text.length}ch` }"></span>
                </template>
              </div>
              <div class="lyrics-text">
                <template v-for="(seg, sIdx) in row.content?.segments ?? []" :key="sIdx">
                  <span>{{ seg.text }}</span>
                </template>
              </div>
            </div>
          </template>

          <template v-else-if="row.type === 'grid' && viewMode === 'lyrics'">
            <div v-if="row.content?.hint" class="lyrics-display">
              <div class="lyrics-text">
                <span>{{ row.content.hint }}</span>
              </div>
            </div>
          </template>

          <!-- Label Row -->
          <template v-if="row.type === 'label' && !isPlaying">
            <div class="section-label">{{ row.content }}</div>
          </template>

          <!-- Spacer -->
          <template v-if="row.type === 'spacer'">
            <div class="row-spacer"></div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.karaoke-view {
  width: 100%;
  margin-top: var(--spacing-md);
}

.karaoke-container {
  position: relative;
  overflow: hidden;
  height: 450px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.is-playing .karaoke-container {
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 15%,
    black 70%,
    transparent 100%
  );
}

.karaoke-content {
  padding: 20px;
  transition: transform 0.4s cubic-bezier(0.2, 0, 0.2, 1);
}

.is-playing .karaoke-content {
  padding-top: 150px;
  padding-bottom: 250px;
}

.karaoke-row {
  height: 72px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-bottom: var(--spacing-xs);
  box-sizing: border-box;
  transition: opacity 0.3s;
}

.karaoke-row:not(.is-active) {
  opacity: 0.8;
}

.is-active {
  opacity: 1 !important;
  transform: scale(1.02);
}

/* Grid Display */
.grid-display {
  background: rgba(255, 255, 255, 0.03);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-md);
}

.is-active .grid-display {
  background: rgba(99, 102, 241, 0.1);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}

.grid-cells {
  display: flex;
  font-family: var(--font-mono);
  font-weight: 600;
  gap: 2px;
}

.cell {
  min-width: 2rem;
  text-align: center;
  padding: 2px;
  border-radius: 4px;
}

.grid-chord { color: var(--color-chord); }
.grid-bar { color: var(--color-grid-bar); }

.current-measure {
  background: var(--color-primary);
  color: white !important;
}

.grid-hint {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.is-active .grid-hint {
  color: var(--color-primary);
  font-weight: 500;
}

/* Lyrics Display */
.lyrics-chords {
  display: flex;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-chord);
  min-height: 1.2em;
}

.is-active .lyrics-chords {
  color: var(--color-primary);
}

.lyrics-text {
  font-size: 1.1rem;
}

.is-active .lyrics-text {
  font-weight: 600;
}

.chord-spacer { display: inline-block; }

/* Labels & Spacers */
.section-label {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 2px;
}

.row-spacer {
  height: 10px;
}
</style>
