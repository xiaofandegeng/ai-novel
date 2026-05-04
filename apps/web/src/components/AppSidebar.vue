<script setup lang="ts">
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  ClipboardList,
  History,
  LayoutDashboard,
  Lightbulb,
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
    name: '伏笔台账',
    path: `/project/${props.projectId}/foreshadowing`,
    icon: Lightbulb,
    activeMatch: /foreshadowing/,
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
    icon: BarChart3,
    activeMatch: /quality/,
  },
  {
    name: '项目健康',
    path: `/project/${props.projectId}/health`,
    icon: Activity,
    activeMatch: /health/,
  },
  {
    name: '自动写作',
    path: `/project/${props.projectId}/autopilot`,
    icon: Bot,
    activeMatch: /autopilot/,
  },
  {
    name: '章后分析',
    path: `/project/${props.projectId}/suggestions`,
    icon: ClipboardList,
    activeMatch: /suggestions/,
  },
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
        工作台
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
          AI 协作守则
        </div>
        <p class="text-[11px] text-text-secondary leading-relaxed">
          AI 结果先进入确认区，再由作者决定插入、替换或丢弃。
        </p>
      </div>
    </div>
  </div>
</template>
