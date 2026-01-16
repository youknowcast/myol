<script setup lang="ts">
interface Props {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  loading?: boolean
  danger?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: 'OK',
  cancelText: 'キャンセル',
  loading: false,
  danger: false
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'update:isOpen', value: boolean): void
}>()

function handleClose() {
  if (props.loading) return
  emit('cancel')
  emit('update:isOpen', false)
}

function handleConfirm() {
  if (props.loading) return
  emit('confirm')
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
    <div class="modal">
      <h3 class="modal-title">{{ title }}</h3>
      <p class="modal-message">
        <slot name="message">{{ message }}</slot>
      </p>
      <div class="modal-actions">
        <button
          class="btn btn-ghost"
          @click="handleClose"
          :disabled="loading"
        >
          {{ cancelText }}
        </button>
        <button
          class="btn"
          :class="danger ? 'btn-danger' : 'btn-primary'"
          @click="handleConfirm"
          :disabled="loading"
        >
          {{ loading ? (confirmText + '中...') : confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease-out;
}

.modal {
  background: var(--color-bg-card);
  padding: var(--spacing-lg);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 400px;
  border: 1px solid var(--color-border);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
  transform-origin: center;
  animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: var(--spacing-md);
  color: var(--color-text);
}

.modal-message {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
  line-height: 1.6;
  white-space: pre-wrap;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

.btn-danger {
  background: var(--color-error, #ef4444);
  color: white;
  border: none;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-danger:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes popIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
