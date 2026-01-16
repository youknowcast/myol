<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Song, Section, GridSection, LyricsSection, GridCell } from '@/lib/chordpro/types'
import GridView from './GridView.vue' // We can reuse sub-components or implement logic directly

interface Props {
  song: Song
  currentMeasure: number
  isPlaying: boolean
  viewMode: 'lyrics' | 'grid'
}

const props = defineProps<Props>()

const rowHeight = 72
const containerHeight = 450

interface KaraokeRow {
  type: 'grid' | 'lyrics' | 'label' | 'spacer'
  sectionIndex: number
  rowIndex: number
  startMeasure: number
  endMeasure: number
  content: any
}

// Flatten the song into rows for karaoke display
const karaokeRows = computed(() => {
  const rows: KaraokeRow[] = []
  let globalMeasureOffset = 0

  props.song.sections.forEach((section, sIdx) => {
    // Add label row if exists
    if (section.label) {
      rows.push({
        type: 'label',
        sectionIndex: sIdx,
        rowIndex: -1,
        startMeasure: globalMeasureOffset,
        endMeasure: globalMeasureOffset,
        content: section.label
      })
    }

    if (section.content.kind === 'grid') {
      const grid = section.content as GridSection
      let sectionMeasures = 0
      let hasSeenFirstBar = false
      let hasSeenNonBarSinceLastBar = false

      grid.rows.forEach((row, rIdx) => {
        const rowStartMeasure = globalMeasureOffset + sectionMeasures

        // Count measures in this row
        row.cells.forEach(cell => {
          const isBar = ['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth'].includes(cell.type)
          if (isBar) {
            if (hasSeenFirstBar && hasSeenNonBarSinceLastBar) {
              sectionMeasures++
            }
            hasSeenFirstBar = true
            hasSeenNonBarSinceLastBar = false
          } else {
            hasSeenNonBarSinceLastBar = true
          }
        })

        const rowEndMeasure = globalMeasureOffset + sectionMeasures

        rows.push({
          type: 'grid',
          sectionIndex: sIdx,
          rowIndex: rIdx,
          startMeasure: rowStartMeasure,
          endMeasure: rowEndMeasure,
          content: {
            cells: row.cells,
            hint: grid.lyricsHints?.[rIdx]
          }
        })
      })

      // Finishing last bar of the section if any
      if (hasSeenFirstBar) {
        sectionMeasures++
      }
      globalMeasureOffset += sectionMeasures

    } else if (section.content.kind === 'lyrics') {
      const lyrics = section.content as LyricsSection
      lyrics.lines.forEach((line, rIdx) => {
        // Simple 1-line = 1-measure mapping for lyrics sections
        const start = globalMeasureOffset + rIdx
        rows.push({
          type: 'lyrics',
          sectionIndex: sIdx,
          rowIndex: rIdx,
          startMeasure: start,
          endMeasure: start,
          content: line
        })
      })
      globalMeasureOffset += lyrics.lines.length
    }

    // Add spacer between sections
    rows.push({
      type: 'spacer',
      sectionIndex: sIdx,
      rowIndex: -1,
      startMeasure: globalMeasureOffset,
      endMeasure: globalMeasureOffset,
      content: null
    })
  })

  return rows
})

const activeRowIndex = computed(() => {
  const idx = karaokeRows.value.findIndex(row =>
    props.currentMeasure >= row.startMeasure && props.currentMeasure <= row.endMeasure
  )
  return idx !== -1 ? idx : 0
})

const contentTransform = computed(() => {
  if (!props.isPlaying) return 'translateY(0)'

  const centerOffset = containerHeight * 0.35 // Higher than middle to show more future context
  const translateY = -(activeRowIndex.value * rowHeight) + centerOffset

  return `translateY(${translateY}px)`
})

function getCellClass(cell: GridCell, row: KaraokeRow): string[] {
  const classes = [cell.type === 'chord' ? 'grid-chord' : 'grid-bar']
  // Sync highlight
  const isBar = ['bar', 'barDouble', 'barEnd', 'repeatStart', 'repeatEnd', 'repeatBoth'].includes(cell.type)
  if (!isBar && props.currentMeasure >= row.startMeasure && props.currentMeasure <= row.endMeasure) {
    // This is oversimplified, ideally we track per-cell measure but for karaoke this is usually enough
    classes.push('current-measure')
  }
  return classes
}

function getCellDisplay(cell: GridCell): string {
  switch (cell.type) {
    case 'bar': return '│'
    case 'barDouble': return '║'
    case 'barEnd': return '║'
    case 'repeatStart': return '║:'
    case 'repeatEnd': return ':║'
    case 'repeatBoth': return ':║:'
    case 'empty': return '·'
    case 'repeat': return cell.value || '%'
    case 'chord': return cell.value || ''
    default: return ''
  }
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
                  v-for="(cell, cIdx) in row.content.cells"
                  :key="cIdx"
                  class="cell"
                  :class="getCellClass(cell, row)"
                >
                  {{ getCellDisplay(cell) }}
                </span>
              </div>
              <div v-if="row.content.hint && viewMode === 'lyrics'" class="grid-hint">
                {{ row.content.hint }}
              </div>
            </div>
          </template>

          <!-- Lyrics Row -->
          <template v-if="row.type === 'lyrics' && viewMode === 'lyrics'">
            <div class="lyrics-display">
              <div class="lyrics-chords">
                <template v-for="(seg, sIdx) in row.content.segments" :key="sIdx">
                  <span v-if="seg.chord" class="chord">{{ seg.chord }}</span>
                  <span v-else class="chord-space">&nbsp;</span>
                  <span class="chord-spacer" :style="{ width: `${seg.text.length}ch` }"></span>
                </template>
              </div>
              <div class="lyrics-text">
                <template v-for="(seg, sIdx) in row.content.segments" :key="sIdx">
                  <span>{{ seg.text }}</span>
                </template>
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
  opacity: 0.4;
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
