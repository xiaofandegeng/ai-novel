<script setup lang="ts">
import type { ButtonVariant } from '../types'
import { computed } from 'vue'

interface Props {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
  disabled?: boolean
  label: string
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'ghost',
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
      return 'h-7 w-7'
    default:
      return 'h-9 w-9'
  }
})

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-primary text-text-inverse hover:bg-primary-hover active:bg-primary-active focus-visible:ring-2 focus-visible:ring-primary/30'
    case 'ghost':
      return 'bg-transparent text-text-secondary hover:bg-bg-subtle active:bg-bg-muted'
    case 'danger':
      return 'bg-semantic-error text-text-inverse hover:opacity-90 active:opacity-80'
    case 'ai':
      return 'bg-ai text-text-inverse hover:opacity-90 active:opacity-80 focus-visible:ring-2 focus-visible:ring-ai/30'
    default:
      return 'bg-bg-surface text-text-primary border border-border-light hover:bg-bg-subtle active:bg-bg-muted'
  }
})

function onClick(e: MouseEvent) {
  if (isDisabled.value)
    return
  emit('click', e)
}
</script>

<template>
  <span class="group relative inline-flex">
    <button
      :type="type"
      :aria-disabled="isDisabled"
      :disabled="isDisabled"
      class="inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none"
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
      <slot v-else />
    </button>
    <span
      class="pointer-events-none absolute left-1/2 top-full mt-1 whitespace-nowrap rounded-md bg-text-primary px-2 py-1 text-xs text-text-inverse opacity-0 transition-opacity -translate-x-1/2 group-hover:opacity-100"
    >
      {{ label }}
    </span>
  </span>
</template>
