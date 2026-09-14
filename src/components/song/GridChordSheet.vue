<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

interface Props {
  open: boolean
  value: string
  candidates: string[]
}

interface Emits {
  (e: 'apply', value: string): void
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const draft = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.open, async (open) => {
  if (!open) return
  draft.value = props.value
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})

function applyDraft() {
  const trimmed = draft.value.trim()
  if (!trimmed) return
  emit('apply', trimmed)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    applyDraft()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="chord-sheet-layer" @keydown="handleKeydown">
      <div class="chord-sheet-backdrop" @click="emit('close')" />
      <div class="chord-sheet" role="dialog" aria-modal="true" aria-label="コードを編集">
        <div class="sheet-handle" />
        <div class="sheet-row">
          <input
            ref="inputRef"
            v-model="draft"
            class="sheet-input"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="コードを入力（例: Am7）"
          />
          <button type="button" class="sheet-btn sheet-btn-primary" @click="applyDraft">
            決定
          </button>
          <button type="button" class="sheet-btn" @click="emit('close')">
            キャンセル
          </button>
        </div>
        <div class="sheet-candidates">
          <button
            v-for="chord in candidates"
            :key="chord"
            type="button"
            class="chip"
            :class="{ active: chord === value }"
            @click="emit('apply', chord)"
          >
            {{ chord }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.chord-sheet-layer {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.chord-sheet-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.chord-sheet {
  position: relative;
  background: var(--color-bg-card);
  border-top-left-radius: var(--radius-lg);
  border-top-right-radius: var(--radius-lg);
  padding: var(--spacing-md);
  padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom));
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  max-height: 60vh;
}

.sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border);
  margin: 0 auto;
}

.sheet-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.sheet-input {
  flex: 1;
  min-width: 0;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 1.1rem;
}

.sheet-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.sheet-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  min-height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
}

.sheet-btn-primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.sheet-candidates {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  overflow-y: auto;
  padding-top: var(--spacing-xs);
}

.chip {
  min-height: 44px;
  min-width: 52px;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.chip.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

@media (min-width: 768px) {
  .chord-sheet {
    align-self: center;
    width: 480px;
    border-radius: var(--radius-lg);
    margin-bottom: var(--spacing-lg);
  }

  .chord-sheet-layer {
    justify-content: flex-end;
  }
}
</style>
