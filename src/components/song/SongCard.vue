<script setup lang="ts">
import type { SongMeta } from '@/lib/chordpro/types'

interface Props {
  song: SongMeta
}

defineProps<Props>()
defineEmits<{ (e: 'delete', id: string): void }>()
</script>

<template>
  <article class="song-card" tabindex="0" role="button">
    <div class="song-header">
      <h2 class="song-title">{{ song.title }}</h2>
      <button
        class="delete-btn"
        @click.stop="$emit('delete', song.id)"
        title="削除"
        aria-label="削除"
      >
        🗑
      </button>
    </div>
    <div class="song-info">
      <span class="song-artist">{{ song.artist }}</span>
      <span v-if="song.key" class="song-key">Key: {{ song.key }}</span>
    </div>
  </article>
</template>

<style scoped>
.song-card {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
}

.song-card:hover,
.song-card:focus {
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.15);
}

.song-card:focus {
  outline: none;
}

.song-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-sm);
}

.song-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
  color: var(--color-text);
  flex: 1;
}

.delete-btn {
  padding: var(--spacing-xs);
  border: none;
  background: transparent;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity var(--transition-fast);
  font-size: 0.875rem;
}

.delete-btn:hover {
  opacity: 1;
}

.song-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.song-key {
  background: var(--color-bg-secondary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  color: var(--color-chord);
  font-family: var(--font-mono);
  font-weight: 500;
}
</style>
