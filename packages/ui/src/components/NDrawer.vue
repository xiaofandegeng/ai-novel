<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'

interface Props {
  modelValue: boolean
  title: string
  width?: string
  overlay?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  width: '420px',
  overlay: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function close() {
  emit('update:modelValue', false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
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
    <Transition name="drawer">
      <div v-if="modelValue" class="fixed inset-0 z-50">
        <div
          v-if="overlay"
          class="absolute inset-0 bg-black/30"
          @click="close"
        />
        <div
          class="absolute right-0 top-0 h-full overflow-y-auto bg-bg-surface shadow-lg"
          :style="{ width }"
        >
          <div class="flex items-center justify-between border-b border-border-light p-4">
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
          <div class="p-4">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 220ms ease-out;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translate-x(100%);
}
</style>
