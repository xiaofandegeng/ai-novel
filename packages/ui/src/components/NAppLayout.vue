<script setup lang="ts">
import { computed, useSlots } from 'vue'

interface Props {
  projectName: string
  currentChapter?: string
  projectId?: string
}

withDefaults(defineProps<Props>(), {
  currentChapter: '',
  projectId: '',
})

const slots = useSlots()

const hasContext = computed(() => !!slots.context)
const hasToolbar = computed(() => !!slots.toolbar)
</script>

<template>
  <div class="h-screen flex flex-col bg-bg-page">
    <!-- Top bar -->
    <header class="h-16 flex shrink-0 items-center border-b border-border-light bg-bg-surface/95 px-6 shadow-sm">
      <div class="flex flex-1 items-center gap-4">
        <slot name="topbar-left">
          <span class="text-base text-text-primary font-semibold">
            {{ projectName }}
          </span>
        </slot>

        <span v-if="currentChapter" class="flex items-center gap-2 text-sm text-text-muted">
          <span class="opacity-30">/</span> {{ currentChapter }}
        </span>
      </div>

      <slot name="topbar-right" />
    </header>

    <!-- Toolbar (optional) -->
    <div v-if="hasToolbar" class="shrink-0 border-b border-border-light bg-bg-surface">
      <slot name="toolbar" />
    </div>

    <!-- Body -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left nav -->
      <aside class="hidden w-64 shrink-0 overflow-y-auto border-r border-border-light bg-bg-surface md:block">
        <slot name="nav" />
      </aside>

      <!-- Main work area -->
      <main class="min-w-0 flex-1 overflow-y-auto bg-bg-page lg:min-w-720px">
        <slot />
      </main>

      <!-- Right context panel -->
      <aside v-if="hasContext" class="hidden w-90 shrink-0 overflow-y-auto border-l border-border-light bg-bg-surface xl:block">
        <slot name="context" />
      </aside>
    </div>
  </div>
</template>
