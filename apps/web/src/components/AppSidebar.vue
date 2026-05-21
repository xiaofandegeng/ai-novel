<script setup lang="ts">
import {
  Activity,
  BookOpen,
  Bot,
  Bug,
  Calendar,
  ClipboardList,
  FilePenLine,
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
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  projectId: string
}>()

const route = useRoute()

const primaryMenuItems = [
  {
    name: '自动驾驶舱',
    path: `/project/${props.projectId}/autopilot`,
    icon: Bot,
    activeMatch: /autopilot/,
  },
  {
    name: '单章写作',
    path: `/project/${props.projectId}/writing-job`,
    icon: FilePenLine,
    activeMatch: /writing-job/,
  },
  {
    name: '项目总览',
    path: `/project/${props.projectId}`,
    icon: LayoutDashboard,
    activeMatch: /^\/project\/[^/]+$/,
  },
  {
    name: '正文工作区',
    path: `/project/${props.projectId}/write`,
    icon: PenLine,
    activeMatch: /write/,
  },
  {
    name: '健康巡检',
    path: `/project/${props.projectId}/health`,
    icon: Activity,
    activeMatch: /health/,
  },
  {
    name: '创作周报',
    path: `/project/${props.projectId}/weekly-report`,
    icon: Calendar,
    activeMatch: /weekly-report/,
  },
  {
    name: '项目设置',
    path: `/project/${props.projectId}/settings`,
    icon: Settings,
    activeMatch: /settings/,
  },
]

const setupItems = [
  {
    name: '故事设定集',
    path: `/project/${props.projectId}/bible`,
    icon: BookOpen,
    activeMatch: /bible/,
  },
  {
    name: '大纲规划',
    path: `/project/${props.projectId}/outline`,
    icon: ListTree,
    activeMatch: /outline/,
  },
  {
    name: '知识库',
    path: `/project/${props.projectId}/knowledge`,
    icon: Search,
    activeMatch: /knowledge/,
  },
]

const ledgerItems = [
  {
    name: '角色档案',
    path: `/project/${props.projectId}/characters`,
    icon: Users,
    activeMatch: /characters/,
  },
  {
    name: '关系图谱',
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
    name: '版本历史',
    path: `/project/${props.projectId}/versions`,
    icon: History,
    activeMatch: /versions/,
  },
  {
    name: '章后流水',
    path: `/project/${props.projectId}/suggestions`,
    icon: ClipboardList,
    activeMatch: /suggestions/,
  },
]

const systemItems = [
  {
    name: '上下文调试',
    path: `/project/${props.projectId}/context-snapshots`,
    icon: Bug,
    activeMatch: /context-snapshots/,
  },
]

type SidebarItem = typeof primaryMenuItems[number]

const hasActiveSetup = computed(() => setupItems.some(isActive))
const hasActiveLedger = computed(() => ledgerItems.some(isActive))
const hasActiveSystem = computed(() => systemItems.some(isActive))

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
        自动化主流程
      </div>
      <router-link
        v-for="item in primaryMenuItems"
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

      <details class="pt-3" :open="hasActiveSetup">
        <summary class="cursor-pointer select-none rounded-md px-3 py-2 text-[11px] text-text-muted font-semibold tracking-widest uppercase hover:bg-bg-subtle hover:text-text-secondary">
          基础设定
        </summary>
        <div class="mt-1 space-y-1">
          <router-link
            v-for="item in setupItems"
            :key="item.path"
            :to="item.path"
            class="group relative min-h-9 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            :class="isActive(item)
              ? 'bg-primary-soft text-primary shadow-sm'
              : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'"
          >
            <span v-if="isActive(item)" class="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-primary" />
            <component
              :is="item.icon"
              :size="17"
              :stroke-width="isActive(item) ? 2.25 : 1.75"
              :class="isActive(item) ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary'"
            />
            <span class="truncate">{{ item.name }}</span>
          </router-link>
        </div>
      </details>

      <details class="pt-1" :open="hasActiveLedger">
        <summary class="cursor-pointer select-none rounded-md px-3 py-2 text-[11px] text-text-muted font-semibold tracking-widest uppercase hover:bg-bg-subtle hover:text-text-secondary">
          自动同步台账
        </summary>
        <p class="px-3 pb-1 text-[11px] text-text-muted leading-relaxed">
          写作时自动抽取并更新，通常只需查看异常。
        </p>
        <div class="space-y-1">
          <router-link
            v-for="item in ledgerItems"
            :key="item.path"
            :to="item.path"
            class="group relative min-h-9 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            :class="isActive(item)
              ? 'bg-primary-soft text-primary shadow-sm'
              : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'"
          >
            <span v-if="isActive(item)" class="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-primary" />
            <component
              :is="item.icon"
              :size="17"
              :stroke-width="isActive(item) ? 2.25 : 1.75"
              :class="isActive(item) ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary'"
            />
            <span class="truncate">{{ item.name }}</span>
          </router-link>
        </div>
      </details>

      <details class="pt-1" :open="hasActiveSystem">
        <summary class="cursor-pointer select-none rounded-md px-3 py-2 text-[11px] text-text-muted font-semibold tracking-widest uppercase hover:bg-bg-subtle hover:text-text-secondary">
          系统工具
        </summary>
        <div class="mt-1 space-y-1">
          <router-link
            v-for="item in systemItems"
            :key="item.path"
            :to="item.path"
            class="group relative min-h-9 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            :class="isActive(item)
              ? 'bg-primary-soft text-primary shadow-sm'
              : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'"
          >
            <span v-if="isActive(item)" class="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-primary" />
            <component
              :is="item.icon"
              :size="17"
              :stroke-width="isActive(item) ? 2.25 : 1.75"
              :class="isActive(item) ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary'"
            />
            <span class="truncate">{{ item.name }}</span>
          </router-link>
        </div>
      </details>
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
