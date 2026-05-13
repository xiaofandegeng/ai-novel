<script setup lang="ts">
import type { ButtonVariant } from '../types'
import { computed } from 'vue'

interface Props {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  size: 'md',
  loading: false,
  disabled: false,
  type: 'button',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isDisabled = computed(() => props.disabled || props.loading)

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-9 px-3 text-sm'
    case 'lg':
      return 'h-12 px-5 text-base'
    default:
      return 'h-10 px-4 text-sm'
  }
})

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-primary text-text-inverse shadow-sm hover:bg-primary-hover active:bg-primary-active focus-visible:ring-2 focus-visible:ring-primary/30'
    case 'ghost':
      return 'bg-transparent text-text-secondary hover:bg-bg-subtle active:bg-bg-muted'
    case 'danger':
      return 'bg-semantic-error text-text-inverse shadow-sm hover:opacity-90 active:opacity-80'
    case 'ai':
      return 'bg-ai text-text-inverse shadow-sm hover:opacity-90 active:opacity-80 focus-visible:ring-2 focus-visible:ring-ai/30'
    default:
      return 'bg-bg-surface text-text-primary border border-border-light shadow-sm hover:bg-bg-subtle active:bg-bg-muted'
  }
})

function onClick(e: MouseEvent) {
  if (isDisabled.value)
    return
  emit('click', e)
}
</script>

<template>
  <button
    :type="type"
    :aria-disabled="isDisabled"
    :disabled="isDisabled"
    class="min-w-10 inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none"
    :class="[sizeClasses, variantClasses, { 'pointer-events-none': loading }]"
    @click="onClick"
  >
    <svg
      v-if="loading"
      class="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
    <slot />
  </button>
</template>
