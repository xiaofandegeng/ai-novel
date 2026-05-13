<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  title?: string
  titleFallback?: string
  titleTo?: RouteLocationRaw
  backTo?: RouteLocationRaw
}>(), {
  titleFallback: '加载中…',
  backTo: '/',
})

const displayTitle = () => props.title || props.titleFallback
</script>

<template>
  <div class="flex items-center gap-4">
    <router-link
      v-if="backTo"
      :to="backTo"
      class="flex items-center gap-2 text-text-muted transition-colors hover:text-primary"
      title="返回书库"
    >
      <ArrowLeft :size="20" />
    </router-link>
    <div v-if="backTo" class="h-6 w-px bg-border-light" />
    <router-link
      v-if="titleTo"
      :to="titleTo"
      class="text-base text-text-primary font-semibold transition-colors hover:text-primary"
    >
      {{ displayTitle() }}
    </router-link>
    <span v-else class="text-base text-text-primary font-semibold">
      <slot name="title-content">
        {{ displayTitle() }}
      </slot>
    </span>
  </div>
</template>
