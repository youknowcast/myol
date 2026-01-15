<script setup lang="ts">
interface Props {
  speed: number
  isPlaying: boolean
}

interface Emits {
  (e: 'update:speed', value: number): void
  (e: 'togglePlay'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const speeds = [0.5, 0.75, 1, 1.5, 2]

function selectSpeed(value: number) {
  emit('update:speed', value)
}

function formatSpeed(value: number): string {
  if (value === 1) return '1x'
  return `${value}x`
}
</script>

<template>
  <div class="speed-control">
    <button
      class="play-btn"
      :class="{ playing: isPlaying }"
      @click="$emit('togglePlay')"
      :aria-label="isPlaying ? '停止' : '再生'"
    >
      {{ isPlaying ? '⏸' : '▶' }}
    </button>

    <div class="speed-buttons">
      <button
        v-for="s in speeds"
        :key="s"
        class="speed-btn"
        :class="{ active: speed === s }"
        @click="selectSpeed(s)"
      >
        {{ formatSpeed(s) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.speed-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
}

.play-btn {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: white;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.play-btn:hover {
  background: var(--color-primary-hover);
  transform: scale(1.05);
}

.play-btn.playing {
  background: var(--color-accent);
}

.speed-buttons {
  display: flex;
  background: var(--color-bg-card);
  border-radius: var(--radius-full);
  padding: 2px;
}

.speed-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  min-width: 2.5rem;
}

.speed-btn:hover {
  color: var(--color-text);
}

.speed-btn.active {
  background: var(--color-primary);
  color: white;
}
</style>
