<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'

interface Props {
  modelValue: boolean
  title: string
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const widthMap: Record<string, string> = {
  sm: '480px',
  md: '640px',
  lg: '800px',
}

const dialogWidth = computed(() => widthMap[props.size] ?? widthMap.md)

function close() {
  emit('update:modelValue', false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    close()
  }
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    close()
  }
}

watch(() => props.modelValue, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden'
  }
  else {
    document.body.style.overflow = ''
  }
})

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-backdrop">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div
          class="absolute inset-0 bg-black/40"
          @click="onBackdropClick"
        />
        <Transition name="modal-dialog" appear>
          <div
            v-if="modelValue"
            class="relative overflow-hidden border border-border-light rounded-xl bg-bg-surface shadow-lg"
            :style="{ width: dialogWidth, maxWidth: '90vw' }"
            @click.stop
          >
            <div class="flex items-center justify-between border-b border-border-light bg-bg-subtle/50 p-5">
              <h3 class="text-base text-text-primary font-semibold">
                {{ title }}
              </h3>
              <button
                class="h-8 w-8 inline-flex items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-subtle hover:text-text-primary"
                aria-label="Close"
                @click="close"
              >
                <svg
                  class="h-5 w-5"
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
            <div class="max-h-[70vh] overflow-y-auto p-5">
              <slot />
            </div>
            <div
              v-if="$slots.footer"
              class="border-t border-border-light bg-bg-subtle/40 p-5"
            >
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.modal-backdrop-enter-active,
.modal-backdrop-leave-active {
  transition: opacity 200ms ease;
}

.modal-backdrop-enter-from,
.modal-backdrop-leave-to {
  opacity: 0;
}

.modal-dialog-enter-active {
  transition: all 200ms ease-out;
}

.modal-dialog-leave-active {
  transition: all 150ms ease-in;
}

.modal-dialog-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.modal-dialog-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
