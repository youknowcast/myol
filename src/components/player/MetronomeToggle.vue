<script setup lang="ts">
interface Props {
  enabled: boolean
}

interface Emits {
  (e: 'toggle'): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<template>
  <button
    class="metronome-btn"
    :class="{ active: enabled }"
    :aria-pressed="enabled"
    aria-label="メトロノーム"
    @click="$emit('toggle')"
  >
    ♩
  </button>
</template>

<style scoped>
.metronome-btn {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.metronome-btn:hover {
  color: var(--color-text);
}

.metronome-btn.active {
  background: var(--color-primary);
  color: white;
}
</style>
