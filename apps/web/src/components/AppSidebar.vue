<script setup lang="ts">
import type { Component } from 'vue'
import {
  BookOpen,
  LayoutDashboard,
  Settings,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  projectId: string
}>()

const route = useRoute()

const menuItems = computed(() => [
  {
    name: '自动写作驾驶舱',
    path: `/project/${props.projectId}`,
    icon: LayoutDashboard,
    activeMatch: /^\/project\/[^/]+$/,
  },
  {
    name: '项目设置',
    path: `/project/${props.projectId}/settings`,
    icon: Settings,
    activeMatch: /settings/,
  },
])

interface SidebarItem {
  name: string
  path: string
  icon: Component
  activeMatch: RegExp
}

function isActive(item: SidebarItem) {
  return item.activeMatch.test(route.path)
}
</script>

<template>
  <div class="h-full flex flex-col border-r border-border-light bg-bg-surface">
    <div class="border-b border-border-light p-4">
      <router-link to="/" class="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-bg-subtle">
        <span class="h-9 w-9 flex items-center justify-center rounded-lg bg-primary-soft text-primary">
          <BookOpen :size="19" />
        </span>
        <span>
          <span class="block text-sm text-text-primary font-bold">创作书库</span>
          <span class="block text-[11px] text-text-muted">Novel Workspace</span>
        </span>
      </router-link>
    </div>

    <nav class="flex-1 overflow-y-auto p-3 space-y-1">
      <div class="px-3 pb-2 pt-1 text-[11px] text-text-muted font-semibold tracking-widest uppercase">
        自动化导航
      </div>
      <router-link
        v-for="item in menuItems"
        :key="item.path"
        :to="item.path"
        class="group relative min-h-10 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        :class="isActive(item)
          ? 'bg-primary-soft text-primary shadow-sm'
          : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'"
      >
        <span
          v-if="isActive(item)"
          class="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-primary"
        />
        <component
          :is="item.icon"
          :size="18"
          :stroke-width="isActive(item) ? 2.25 : 1.75"
          :class="isActive(item) ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary'"
        />
        <span class="truncate">{{ item.name }}</span>
      </router-link>
    </nav>

    <div class="border-t border-border-light p-4">
      <div class="border border-ai/10 rounded-lg bg-ai-soft/60 p-3">
        <div class="mb-1 text-xs text-ai font-bold">
          AI 自动驾驶守则
        </div>
        <p class="text-[11px] text-text-secondary leading-relaxed">
          AI 结果由自动驾驶引擎检查、修复与写回；异常内容进入隔离队列。
        </p>
      </div>
    </div>
  </div>
</template>
