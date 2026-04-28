<script setup lang="ts">
import {
  BookOpen,
  History,
  LayoutDashboard,
  ListTree,
  PenLine,
  Search,
  Settings,
  Share2,
  Users,
  Zap,
} from 'lucide-vue-next'
import { useRoute } from 'vue-router'

const props = defineProps<{
  projectId: string
}>()

const route = useRoute()

const menuItems = [
  {
    name: '仪表盘',
    path: `/project/${props.projectId}`,
    icon: LayoutDashboard,
    activeMatch: /^\/project\/[^/]+$/,
  },
  {
    name: '故事设定集',
    path: `/project/${props.projectId}/bible`,
    icon: BookOpen,
    activeMatch: /bible/,
  },
  {
    name: '角色管理',
    path: `/project/${props.projectId}/characters`,
    icon: Users,
    activeMatch: /characters/,
  },
  {
    name: '人物关系',
    path: `/project/${props.projectId}/relationships`,
    icon: Share2,
    activeMatch: /relationships/,
  },
  {
    name: '矛盾矩阵',
    path: `/project/${props.projectId}/conflicts`,
    icon: Zap,
    activeMatch: /conflicts/,
  },
  {
    name: '知识库',
    path: `/project/${props.projectId}/knowledge`,
    icon: Search,
    activeMatch: /knowledge/,
  },
  {
    name: '大纲规划',
    path: `/project/${props.projectId}/outline`,
    icon: ListTree,
    activeMatch: /outline/,
  },
  {
    name: '正文写作',
    path: `/project/${props.projectId}/write`,
    icon: PenLine,
    activeMatch: /write/,
  },
  {
    name: '版本历史',
    path: `/project/${props.projectId}/versions`,
    icon: History,
    activeMatch: /versions/,
  },
  {
    name: '质量评估',
    path: `/project/${props.projectId}/quality`,
    icon: Zap,
    activeMatch: /quality/,
  },
]

const adminItems = [
  {
    name: '项目设置',
    path: `/project/${props.projectId}/settings`,
    icon: Settings,
    activeMatch: /settings/,
  },
]

function isActive(item: typeof menuItems[0]) {
  return item.activeMatch.test(route.path)
}
</script>

<template>
  <div class="h-full flex flex-col border-r border-border-light bg-bg-surface">
    <!-- Project Selector / Brand Area at top of sidebar if needed -->
    <div class="border-b border-border-light bg-bg-page/50 p-4">
      <router-link to="/" class="flex items-center gap-2 text-text-primary transition-colors hover:text-primary">
        <BookOpen :size="20" />
        <span class="text-sm font-bold">书库</span>
      </router-link>
    </div>

    <!-- Main Navigation -->
    <nav class="flex-1 p-2 space-y-1">
      <router-link
        v-for="item in menuItems"
        :key="item.path"
        :to="item.path"
        class="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
        :class="isActive(item)
          ? 'bg-primary/10 text-primary'
          : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'"
      >
        <component
          :is="item.icon"
          :size="18"
          :stroke-width="isActive(item) ? 2.25 : 1.75"
          :class="isActive(item) ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary'"
        />
        {{ item.name }}
      </router-link>
    </nav>

    <!-- Bottom Actions -->
    <div class="border-t border-border-light p-2">
      <router-link
        v-for="item in adminItems"
        :key="item.path"
        :to="item.path"
        class="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
        :class="isActive(item)
          ? 'bg-primary/10 text-primary'
          : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'"
      >
        <component
          :is="item.icon"
          :size="18"
          :stroke-width="isActive(item) ? 2.25 : 1.75"
          :class="isActive(item) ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary'"
        />
        {{ item.name }}
      </router-link>
    </div>
  </div>
</template>
