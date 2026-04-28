<script setup lang="ts">
import { useToast } from '../composables/useToast'

const { toasts, remove } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="fixed right-4 top-4 z-100 flex flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="max-w-sm flex items-start gap-2 rounded-md bg-bg-surface p-3 shadow-md"
          :class="{
            'border-l-4 border-semantic-success': toast.type === 'success',
            'border-l-4 border-semantic-info': toast.type === 'info',
            'border-l-4 border-semantic-warning': toast.type === 'warning',
            'border-l-4 border-semantic-error': toast.type === 'error',
          }"
        >
          <!-- Success icon -->
          <svg
            v-if="toast.type === 'success'"
            class="mt-0.5 h-5 w-5 shrink-0 text-semantic-success"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>

          <!-- Info icon -->
          <svg
            v-if="toast.type === 'info'"
            class="mt-0.5 h-5 w-5 shrink-0 text-semantic-info"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>

          <!-- Warning icon -->
          <svg
            v-if="toast.type === 'warning'"
            class="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>

          <!-- Error icon -->
          <svg
            v-if="toast.type === 'error'"
            class="mt-0.5 h-5 w-5 shrink-0 text-semantic-error"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>

          <p class="flex-1 text-sm text-text-primary">
            {{ toast.message }}
          </p>

          <button
            class="h-5 w-5 inline-flex shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:text-text-primary"
            aria-label="Dismiss"
            @click="remove(toast.id)"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style>
.toast-enter-active {
  transition: all 220ms ease-out;
}

.toast-leave-active {
  transition: all 180ms ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translate-x(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translate-x(100%);
}

.toast-move {
  transition: transform 220ms ease-out;
}
</style>
