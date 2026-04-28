<script setup lang="ts">
import { computed } from 'vue'

type TagVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' | 'ai'
type TagSize = 'sm' | 'md'

interface Props {
  variant?: TagVariant
  size?: TagSize
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
})

const sizeClasses = computed(() => {
  return props.size === 'sm'
    ? 'h-5 px-1.5 text-xs'
    : 'h-6 px-2 text-xs'
})

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-primary-soft text-primary'
    case 'success':
      return 'bg-semantic-success/10 text-semantic-success'
    case 'warning':
      return 'bg-semantic-warning/10 text-semantic-warning'
    case 'error':
      return 'bg-semantic-error/10 text-semantic-error'
    case 'info':
      return 'bg-semantic-info/10 text-semantic-info'
    case 'ai':
      return 'bg-ai-soft text-ai'
    default:
      return 'bg-bg-muted text-text-secondary'
  }
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-md font-medium"
    :class="[sizeClasses, variantClasses]"
  >
    <slot />
  </span>
</template>
