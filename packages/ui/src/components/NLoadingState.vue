<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'page' | 'card' | 'table' | 'text'
  rows?: number
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'page',
  rows: 5,
})

const widths = ['w-full', 'w-5/6', 'w-4/6', 'w-2/3', 'w-1/2', 'w-1/3']

const textLines = computed(() =>
  Array.from({ length: props.rows }, (_, i) => widths[i % widths.length]),
)

const tableRows = computed(() => [
  { col1: 'w-1/4', col2: 'w-1/3', col3: 'w-1/5', col4: 'w-1/6' },
  { col1: 'w-1/5', col2: 'w-2/5', col3: 'w-1/4', col4: 'w-1/6' },
  { col1: 'w-1/3', col2: 'w-1/4', col3: 'w-1/3', col4: 'w-1/6' },
  { col1: 'w-1/6', col2: 'w-1/2', col3: 'w-1/5', col4: 'w-1/4' },
  { col1: 'w-1/4', col2: 'w-1/3', col3: 'w-1/6', col4: 'w-1/5' },
])
</script>

<template>
  <!-- Page variant -->
  <div v-if="variant === 'page'" class="p-6 space-y-6">
    <div class="h-8 w-1/3 animate-pulse rounded-md bg-bg-muted" />
    <div class="space-y-3">
      <div class="h-4 w-full animate-pulse rounded-md bg-bg-muted" />
      <div class="h-4 w-5/6 animate-pulse rounded-md bg-bg-muted" />
      <div class="h-4 w-4/6 animate-pulse rounded-md bg-bg-muted" />
    </div>
    <div class="h-32 w-full animate-pulse rounded-md bg-bg-muted" />
  </div>

  <!-- Card variant -->
  <div v-else-if="variant === 'card'" class="border border-border-light rounded-lg p-4 space-y-4">
    <div class="h-5 w-1/3 animate-pulse rounded-md bg-bg-muted" />
    <div class="space-y-2">
      <div class="h-4 w-full animate-pulse rounded-md bg-bg-muted" />
      <div class="h-4 w-5/6 animate-pulse rounded-md bg-bg-muted" />
    </div>
    <div class="flex items-center justify-between pt-2">
      <div class="h-4 w-1/4 animate-pulse rounded-md bg-bg-muted" />
      <div class="h-8 w-20 animate-pulse rounded-md bg-bg-muted" />
    </div>
  </div>

  <!-- Table variant -->
  <div v-else-if="variant === 'table'" class="space-y-0">
    <div class="flex gap-4 border-b border-border-light p-3">
      <div class="h-4 w-1/4 animate-pulse rounded-md bg-bg-muted" />
      <div class="h-4 w-1/3 animate-pulse rounded-md bg-bg-muted" />
      <div class="h-4 w-1/5 animate-pulse rounded-md bg-bg-muted" />
      <div class="h-4 w-1/6 animate-pulse rounded-md bg-bg-muted" />
    </div>
    <div
      v-for="(row, index) in tableRows"
      :key="index"
      class="flex gap-4 border-b border-border-light p-3 last:border-b-0"
    >
      <div class="h-4 animate-pulse rounded-md bg-bg-muted" :class="row.col1" />
      <div class="h-4 animate-pulse rounded-md bg-bg-muted" :class="row.col2" />
      <div class="h-4 animate-pulse rounded-md bg-bg-muted" :class="row.col3" />
      <div class="h-4 animate-pulse rounded-md bg-bg-muted" :class="row.col4" />
    </div>
  </div>

  <!-- Text variant -->
  <div v-else class="space-y-2">
    <div
      v-for="(w, index) in textLines"
      :key="index"
      class="h-4 animate-pulse rounded-md bg-bg-muted"
      :class="w"
    />
  </div>
</template>
