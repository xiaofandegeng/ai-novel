<script setup lang="ts">
interface Props {
  title: string
  description?: string
}

withDefaults(defineProps<Props>(), {
  description: '',
})
</script>

<template>
  <div class="mx-auto max-w-sm flex flex-col items-center justify-center px-6 py-12 text-center">
    <div class="h-16 w-16 flex items-center justify-center rounded-xl bg-bg-subtle">
      <slot name="icon">
        <svg
          class="h-8 w-8 text-text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
          <path d="M3 9h6" />
        </svg>
      </slot>
    </div>
    <h3 class="mt-4 text-lg text-text-primary font-semibold">
      {{ title }}
    </h3>
    <p v-if="description" class="mt-2 text-sm text-text-muted">
      {{ description }}
    </p>
    <div v-if="$slots.action" class="mt-4">
      <slot name="action" />
    </div>
  </div>
</template>
