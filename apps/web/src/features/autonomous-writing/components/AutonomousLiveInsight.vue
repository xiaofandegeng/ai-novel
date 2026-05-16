<script setup lang="ts">
import {
  NPanel,
  NTag,
} from '@ai-novel/ui'
import {
  Activity,
  BookOpen,
  ChevronRight,
  GitCompare,
  Users,
  Zap,
} from 'lucide-vue-next'
import { onMounted, onUnmounted, ref } from 'vue'
import { fetchAutonomousInsight } from '@/api/autonomous-runs'

const props = defineProps<{
  projectId: string
}>()

const insight = ref<any>(null)
const timer = ref<any>(null)

async function load() {
  try {
    insight.value = await fetchAutonomousInsight(props.projectId)
  }
  catch (err) {
    console.error('Failed to load narrative insight', err)
  }
}

onMounted(() => {
  load()
  timer.value = setInterval(load, 10000) // Refresh every 10 seconds
})

onUnmounted(() => {
  if (timer.value)
    clearInterval(timer.value)
})

function getEventIcon(type: string) {
  switch (type) {
    case 'character_create':
    case 'character_update': return Users
    case 'relationship_create':
    case 'relationship_update': return GitCompare
    case 'conflict_create':
    case 'conflict_update': return Zap
    default: return Activity
  }
}

function getEventColor(type: string) {
  if (type.includes('character'))
    return 'text-blue-500 bg-blue-50'
  if (type.includes('relationship'))
    return 'text-purple-500 bg-purple-50'
  if (type.includes('conflict'))
    return 'text-orange-500 bg-orange-50'
  return 'text-text-muted bg-bg-subtle'
}
</script>

<template>
  <div class="autonomous-live-insight space-y-6">
    <!-- Quick Stats -->
    <div v-if="insight" class="grid grid-cols-2 gap-3">
      <div class="stat-card border border-border-light rounded-xl bg-bg-surface p-3 shadow-sm">
        <div class="mb-1 flex items-center gap-2 text-text-muted">
          <Users :size="14" />
          <span class="text-[10px] font-medium tracking-wider uppercase">角色 & 关系</span>
        </div>
        <div class="flex items-baseline gap-1">
          <span class="text-xl font-bold">{{ insight.stats.characterCount }}</span>
          <span class="text-[10px] text-text-muted">/ {{ insight.stats.relationshipCount }} 关系</span>
        </div>
      </div>

      <div class="stat-card border border-border-light rounded-xl bg-bg-surface p-3 shadow-sm">
        <div class="mb-1 flex items-center gap-2 text-text-muted">
          <Zap :size="14" />
          <span class="text-[10px] font-medium tracking-wider uppercase">活跃矛盾</span>
        </div>
        <div class="flex items-baseline gap-1">
          <span class="text-xl text-orange-500 font-bold">{{ insight.stats.activeConflictCount }}</span>
          <span class="text-[10px] text-text-muted">个进行中</span>
        </div>
      </div>
    </div>

    <!-- Progress Stats -->
    <div v-if="insight" class="border border-border-light rounded-xl bg-bg-surface p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-bold">
          <BookOpen :size="16" class="text-primary" />
          写作进度
        </div>
        <NTag size="sm" variant="primary">
          {{ Math.round((insight.stats.completedChapters / insight.stats.totalChapters) * 100) || 0 }}%
        </NTag>
      </div>
      <div class="space-y-2">
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
          <div
            class="h-full bg-primary transition-all duration-500"
            :style="{ width: `${(insight.stats.completedChapters / insight.stats.totalChapters) * 100 || 0}%` }"
          />
        </div>
        <div class="flex justify-between text-[10px] text-text-muted">
          <span>已完成 {{ insight.stats.completedChapters }} / {{ insight.stats.totalChapters }} 章</span>
          <span>共 {{ (insight.stats.totalWords / 10000).toFixed(1) }} 万字</span>
        </div>
      </div>
    </div>

    <!-- Recent Narrative Events -->
    <NPanel v-if="insight" title="剧情与设定实时演进">
      <div class="py-1 space-y-3">
        <div
          v-for="event in insight.recentEvents"
          :key="event.id"
          class="event-item group flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-bg-subtle"
        >
          <div class="mt-0.5 rounded-md p-1.5" :class="getEventColor(event.type)">
            <component :is="getEventIcon(event.type)" :size="14" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-xs font-medium">{{ event.title }}</span>
              <span class="whitespace-nowrap text-[9px] text-text-muted">{{ new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
            </div>
            <div class="mt-0.5 flex items-center gap-1">
              <NTag size="sm" :variant="event.status === 'applied' ? 'success' : 'default'">
                {{ event.status === 'applied' ? '已入库' : '待确认' }}
              </NTag>
              <span class="text-[9px] text-text-muted">{{ event.type.split('_').join(' ') }}</span>
            </div>
          </div>
          <ChevronRight :size="12" class="mt-2 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <div v-if="insight.recentEvents.length === 0" class="py-6 text-center text-[10px] text-text-muted">
          暂无叙事演进事件
        </div>
      </div>
    </NPanel>
  </div>
</template>

<style lang="scss" scoped>
.autonomous-live-insight {
  .stat-card {
    transition: transform 0.2s;
    &:hover {
      transform: translateY(-2px);
    }
  }
}
</style>
