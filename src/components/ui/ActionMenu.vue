<script setup lang="ts">
import { ref } from 'vue'

interface ActionMenuItem {
  id: string
  label: string
  onSelect: () => void
  disabled?: boolean
}

interface Props {
  items: ActionMenuItem[]
  align?: 'left' | 'right'
}

const { align } = withDefaults(defineProps<Props>(), {
  align: 'right'
})

const isOpen = ref(false)

function toggleMenu() {
  isOpen.value = !isOpen.value
}

function closeMenu() {
  isOpen.value = false
}

function handleSelect(item: ActionMenuItem) {
  if (item.disabled) return
  item.onSelect()
  closeMenu()
}
</script>

<template>
  <div class="action-menu">
    <button class="action-menu-trigger" @click.stop="toggleMenu">
      <slot name="trigger">⋯</slot>
    </button>
    <div v-if="isOpen" class="action-menu-list" :class="`align-${align}`">
      <button
        v-for="item in items"
        :key="item.id"
        class="action-menu-item"
        :disabled="item.disabled"
        @click.stop="handleSelect(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.action-menu {
  position: relative;
}

.action-menu-trigger {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
}

.action-menu-list {
  position: absolute;
  top: 32px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  min-width: 140px;
  z-index: 30;
}

.action-menu-list.align-right {
  right: 0;
}

.action-menu-list.align-left {
  left: 0;
}

.action-menu-item {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: transparent;
  border: none;
  text-align: left;
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.75rem;
}

.action-menu-item:hover:not(:disabled) {
  background: var(--color-bg-secondary);
}

.action-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
