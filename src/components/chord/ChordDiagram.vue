<script setup lang="ts">
import { computed } from 'vue'
import { getChordDiagram } from '@/lib/chords/dictionary'

interface Props {
  chord: string
  size?: 'small' | 'normal'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'normal'
})

const diagram = computed(() => getChordDiagram(props.chord))


function getFretDisplay(fret: number): string {
  if (fret === -1) return '×'
  if (fret === 0) return '○'
  return ''
}

function shouldShowDot(stringIndex: number, fretPosition: number): boolean {
  if (!diagram.value) return false
  const fret = diagram.value.frets[stringIndex]
  if (fret === undefined) return false
  const baseFret = diagram.value.baseFret || 1
  return fret > 0 && (fret - baseFret + 1) === fretPosition
}

function isBarré(stringIndex: number, fretPosition: number): boolean {
  if (!diagram.value || !diagram.value.barré) return false
  const barréFret = diagram.value.barré
  const baseFret = diagram.value.baseFret || 1
  const fret = diagram.value.frets[stringIndex]
  if (fret === undefined) return false
  return (barréFret - baseFret + 1) === fretPosition && fret >= barréFret
}
</script>

<template>
  <div class="chord-diagram" :class="[`size-${size}`]">
    <div class="chord-name">{{ chord }}</div>

    <div v-if="diagram" class="diagram-container">
      <!-- Base fret indicator -->
      <div v-if="diagram.baseFret && diagram.baseFret > 1" class="base-fret">
        {{ diagram.baseFret }}fr
      </div>

      <!-- String tops (open/muted indicators) -->
      <div class="string-tops">
        <span
          v-for="(fret, index) in diagram.frets"
          :key="index"
          class="string-top"
          :class="{ muted: fret === -1, open: fret === 0 }"
        >
          {{ getFretDisplay(fret) }}
        </span>
      </div>

      <!-- Fretboard -->
      <div class="fretboard">
        <!-- Nut -->
        <div class="nut" :class="{ hidden: diagram.baseFret && diagram.baseFret > 1 }"></div>

        <!-- Frets -->
        <div v-for="fretNum in 4" :key="fretNum" class="fret">
          <div
            v-for="stringIndex in 6"
            :key="stringIndex"
            class="fret-position"
          >
            <span
              v-if="shouldShowDot(stringIndex - 1, fretNum)"
              class="dot"
              :class="{ barré: isBarré(stringIndex - 1, fretNum) }"
            ></span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="no-diagram">
      ?
    </div>
  </div>
</template>

<style scoped>
.chord-diagram {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-chord-diagram-bg);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
}

.chord-diagram.size-small {
  padding: var(--spacing-xs);
}

.chord-name {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-chord);
  margin-bottom: var(--spacing-xs);
  font-size: 0.875rem;
}

.size-small .chord-name {
  font-size: 0.75rem;
}

.diagram-container {
  position: relative;
}

.base-fret {
  position: absolute;
  left: -1.5rem;
  top: 1.2rem;
  font-size: 0.625rem;
  color: var(--color-text-muted);
}

.size-small .base-fret {
  left: -1.2rem;
  font-size: 0.5rem;
}

.string-tops {
  display: flex;
  justify-content: space-between;
  width: 60px;
  margin-bottom: 2px;
}

.size-small .string-tops {
  width: 45px;
}

.string-top {
  width: 10px;
  text-align: center;
  font-size: 0.625rem;
  color: var(--color-text-muted);
  height: 12px;
}

.string-top.muted {
  color: var(--color-error);
}

.string-top.open {
  color: var(--color-success);
}

.fretboard {
  position: relative;
  width: 60px;
  background: linear-gradient(
    to right,
    transparent 7px,
    var(--color-chord-string) 7px,
    var(--color-chord-string) 8px,
    transparent 8px,
    transparent 18px,
    var(--color-chord-string) 18px,
    var(--color-chord-string) 19px,
    transparent 19px,
    transparent 29px,
    var(--color-chord-string) 29px,
    var(--color-chord-string) 30px,
    transparent 30px,
    transparent 40px,
    var(--color-chord-string) 40px,
    var(--color-chord-string) 41px,
    transparent 41px,
    transparent 51px,
    var(--color-chord-string) 51px,
    var(--color-chord-string) 52px,
    transparent 52px
  );
}

.size-small .fretboard {
  width: 45px;
  background: linear-gradient(
    to right,
    transparent 5px,
    var(--color-chord-string) 5px,
    var(--color-chord-string) 6px,
    transparent 6px,
    transparent 13px,
    var(--color-chord-string) 13px,
    var(--color-chord-string) 14px,
    transparent 14px,
    transparent 21px,
    var(--color-chord-string) 21px,
    var(--color-chord-string) 22px,
    transparent 22px,
    transparent 29px,
    var(--color-chord-string) 29px,
    var(--color-chord-string) 30px,
    transparent 30px,
    transparent 37px,
    var(--color-chord-string) 37px,
    var(--color-chord-string) 38px,
    transparent 38px
  );
}

.nut {
  height: 3px;
  background: var(--color-text);
  border-radius: 1px;
}

.nut.hidden {
  background: var(--color-chord-fret);
  height: 1px;
}

.fret {
  display: flex;
  justify-content: space-between;
  height: 16px;
  border-bottom: 1px solid var(--color-chord-fret);
}

.size-small .fret {
  height: 12px;
}

.fret-position {
  width: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.dot {
  width: 8px;
  height: 8px;
  background: var(--color-chord-dot);
  border-radius: 50%;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}

.size-small .dot {
  width: 6px;
  height: 6px;
}

.no-diagram {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 1.5rem;
}

.size-small .no-diagram {
  width: 45px;
  height: 45px;
  font-size: 1rem;
}
</style>
