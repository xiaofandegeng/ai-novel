<script setup lang="ts">
import { NButton, NTag } from '@ai-novel/ui'
import {
  Compass,
  GitFork,
  Link,
  ShieldCheck,
  TrendingUp,
  UserCheck,
} from 'lucide-vue-next'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchHealthMetrics } from '@/api/health-metrics'

interface RiskItem {
  id: string
  severity: 'low' | 'medium' | 'high'
  type: string
  title: string
  message: string
  actionLabel: string
  targetRoute: string
  evidence?: string[]
  suggestions?: string[]
}

const props = defineProps<{
  projectId: string
  refreshTrigger?: number
}>()

const metrics = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const timer = ref<any>(null)

async function loadHealth() {
  if (!props.projectId)
    return
  loading.value = true
  try {
    metrics.value = await fetchHealthMetrics(props.projectId)
    error.value = null
  }
  catch (err: any) {
    error.value = err.message || '获取健康指标失败'
  }
  finally {
    loading.value = false
  }
}

watch(() => props.refreshTrigger, () => {
  loadHealth()
})

watch(() => props.projectId, () => {
  loadHealth()
})

onMounted(() => {
  loadHealth()
  // Poll health metrics every 15 seconds to sync with autopilot progress
  timer.value = setInterval(loadHealth, 15000)
})

onUnmounted(() => {
  if (timer.value)
    clearInterval(timer.value)
})

// Categories
const themeRisks = ref<RiskItem[]>([])
const oocRisks = ref<RiskItem[]>([])
const foreshadowingRisks = ref<RiskItem[]>([])
const relationshipRisks = ref<RiskItem[]>([])

watch(metrics, (newVal) => {
  if (!newVal || !newVal.risks) {
    themeRisks.value = []
    oocRisks.value = []
    foreshadowingRisks.value = []
    relationshipRisks.value = []
    return
  }

  const list = newVal.risks as RiskItem[]

  // Theme Drift
  themeRisks.value = list.filter(r => r.type === 'theme')

  // Character OOC
  oocRisks.value = list.filter(r => r.type === 'consistency' && (r.title.includes('OOC') || r.title.includes('性格') || r.title.includes('一致性')))

  // Foreshadowing
  foreshadowingRisks.value = list.filter(r => r.type === 'foreshadowing')

  // Relationship fractures
  relationshipRisks.value = list.filter(r => r.id === 'isolated-characters' || r.type === 'relationship')
}, { immediate: true })

function getSeverityTag(severity: string) {
  switch (severity) {
    case 'high': return 'error'
    case 'medium': return 'warning'
    case 'low': return 'primary'
    default: return 'default'
  }
}

function getSeverityLabel(severity: string) {
  switch (severity) {
    case 'high': return '高风险'
    case 'medium': return '中风险'
    case 'low': return '低风险'
    default: return '正常'
  }
}
</script>

<template>
  <div class="autopilot-health-panel space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-sm text-text-primary font-bold">
          自动化写作巡检与纠偏
        </h2>
        <p class="text-xs text-text-muted">
          实时扫描大纲与生成章节的一致性，智能隔离或提供剧情纠偏对策。
        </p>
      </div>
      <NTag v-if="metrics" size="sm" :variant="metrics.risks?.length > 0 ? 'warning' : 'success'">
        {{ metrics.risks?.length || 0 }} 项提示
      </NTag>
    </div>

    <!-- Scores Radar summary -->
    <div v-if="metrics?.radarMetrics" class="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <div
        v-for="(score, key) in metrics.radarMetrics"
        :key="key"
        class="radar-item border border-border-light rounded-lg bg-bg-surface p-2 text-center transition-all hover:border-primary/30"
      >
        <div class="text-[10px] text-text-muted capitalize">
          {{ String(key) === 'theme' ? '主线主题' : String(key) === 'character' ? '人物性格' : String(key) === 'foreshadowing' ? '伏笔回收' : String(key) === 'conflict' ? '冲突强度' : String(key) === 'pacing' ? '叙事节奏' : '文风对齐' }}
        </div>
        <div class="mt-1 text-base font-bold" :class="score < 60 ? 'text-red-500' : (score < 80 ? 'text-orange-500' : 'text-green-600')">
          {{ score }}
        </div>
      </div>
    </div>

    <!-- Core Risk Grid -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <!-- 1. Theme Card -->
      <div class="risk-card border border-border-light rounded-lg bg-bg-surface p-4 transition-all duration-300">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-red-50 p-2 text-red-500">
              <Compass :size="20" />
            </div>
            <div>
              <h3 class="text-sm font-bold">
                偏题与主线偏离
              </h3>
              <p class="text-xs text-text-muted">
                检测章节正文是否偏离设定集的核心大纲和主要矛盾。
              </p>
            </div>
          </div>
          <NTag v-if="themeRisks.length > 0" size="sm" :variant="getSeverityTag(themeRisks[0].severity) as any">
            {{ getSeverityLabel(themeRisks[0].severity) }}
          </NTag>
          <NTag v-else size="sm" variant="success">
            正常
          </NTag>
        </div>

        <div class="mt-3 min-h-[90px] flex flex-col justify-between">
          <div v-if="themeRisks.length > 0" class="space-y-2">
            <p class="text-xs text-text-secondary leading-relaxed">
              {{ themeRisks[0].message }}
            </p>
            <div v-if="themeRisks[0].suggestions && themeRisks[0].suggestions.length > 0" class="rounded bg-bg-subtle p-2">
              <div class="text-[9px] text-text-muted font-semibold uppercase">
                建议对策
              </div>
              <ul class="mt-1 list-disc list-inside text-[10px] text-text-secondary space-y-1">
                <li v-for="s in themeRisks[0].suggestions" :key="s">
                  {{ s }}
                </li>
              </ul>
            </div>
          </div>
          <div v-else class="flex flex-1 items-center justify-center gap-2 text-xs text-green-600">
            <ShieldCheck :size="16" /> 主题贴合度极佳，无偏题风险
          </div>

          <div v-if="themeRisks.length > 0" class="mt-3 flex justify-end">
            <router-link :to="themeRisks[0].targetRoute">
              <NButton size="sm" variant="primary">
                {{ themeRisks[0].actionLabel }} <Link :size="10" class="ml-1" />
              </NButton>
            </router-link>
          </div>
        </div>
      </div>

      <!-- 2. OOC Card -->
      <div class="risk-card border border-border-light rounded-lg bg-bg-surface p-4 transition-all duration-300">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-blue-50 p-2 text-blue-500">
              <UserCheck :size="20" />
            </div>
            <div>
              <h3 class="text-sm font-bold">
                人物跑偏 (OOC)
              </h3>
              <p class="text-xs text-text-muted">
                校验生成对话与行为是否符合角色的设定性格与行事动机。
              </p>
            </div>
          </div>
          <NTag v-if="oocRisks.length > 0" size="sm" :variant="getSeverityTag(oocRisks[0].severity) as any">
            {{ getSeverityLabel(oocRisks[0].severity) }}
          </NTag>
          <NTag v-else size="sm" variant="success">
            正常
          </NTag>
        </div>

        <div class="mt-3 min-h-[90px] flex flex-col justify-between">
          <div v-if="oocRisks.length > 0" class="space-y-2">
            <p class="text-xs text-text-secondary leading-relaxed">
              {{ oocRisks[0].message }}
            </p>
            <div v-if="oocRisks[0].suggestions && oocRisks[0].suggestions.length > 0" class="rounded bg-bg-subtle p-2">
              <div class="text-[9px] text-text-muted font-semibold uppercase">
                建议对策
              </div>
              <ul class="mt-1 list-disc list-inside text-[10px] text-text-secondary space-y-1">
                <li v-for="s in oocRisks[0].suggestions" :key="s">
                  {{ s }}
                </li>
              </ul>
            </div>
          </div>
          <div v-else class="flex flex-1 items-center justify-center gap-2 text-xs text-green-600">
            <ShieldCheck :size="16" /> 人物性格稳定，符合设定
          </div>

          <div v-if="oocRisks.length > 0" class="mt-3 flex justify-end">
            <router-link :to="oocRisks[0].targetRoute">
              <NButton size="sm" variant="primary">
                {{ oocRisks[0].actionLabel }} <Link :size="10" class="ml-1" />
              </NButton>
            </router-link>
          </div>
        </div>
      </div>

      <!-- 3. Foreshadowing Card -->
      <div class="risk-card border border-border-light rounded-lg bg-bg-surface p-4 transition-all duration-300">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-amber-50 p-2 text-amber-500">
              <TrendingUp :size="20" />
            </div>
            <div>
              <h3 class="text-sm font-bold">
                伏笔遗忘与断闭环
              </h3>
              <p class="text-xs text-text-muted">
                自动监测已埋下但超出预定章节仍未回收的伏笔或线索。
              </p>
            </div>
          </div>
          <NTag v-if="foreshadowingRisks.length > 0" size="sm" :variant="getSeverityTag(foreshadowingRisks[0].severity) as any">
            {{ getSeverityLabel(foreshadowingRisks[0].severity) }}
          </NTag>
          <NTag v-else size="sm" variant="success">
            正常
          </NTag>
        </div>

        <div class="mt-3 min-h-[90px] flex flex-col justify-between">
          <div v-if="foreshadowingRisks.length > 0" class="space-y-2">
            <p class="text-xs text-text-secondary leading-relaxed">
              {{ foreshadowingRisks[0].message }}
            </p>
            <div v-if="foreshadowingRisks[0].suggestions && foreshadowingRisks[0].suggestions.length > 0" class="rounded bg-bg-subtle p-2">
              <div class="text-[9px] text-text-muted font-semibold uppercase">
                建议对策
              </div>
              <ul class="mt-1 list-disc list-inside text-[10px] text-text-secondary space-y-1">
                <li v-for="s in foreshadowingRisks[0].suggestions" :key="s">
                  {{ s }}
                </li>
              </ul>
            </div>
          </div>
          <div v-else class="flex flex-1 items-center justify-center gap-2 text-xs text-green-600">
            <ShieldCheck :size="16" /> 伏笔线索全部处于正常闭环生命周期内
          </div>

          <div v-if="foreshadowingRisks.length > 0" class="mt-3 flex justify-end">
            <router-link :to="foreshadowingRisks[0].targetRoute">
              <NButton size="sm" variant="primary">
                {{ foreshadowingRisks[0].actionLabel }} <Link :size="10" class="ml-1" />
              </NButton>
            </router-link>
          </div>
        </div>
      </div>

      <!-- 4. Relationship Card -->
      <div class="risk-card border border-border-light rounded-lg bg-bg-surface p-4 transition-all duration-300">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-purple-50 p-2 text-purple-500">
              <GitFork :size="20" />
            </div>
            <div>
              <h3 class="text-sm font-bold">
                关系网与矛盾孤立
              </h3>
              <p class="text-xs text-text-muted">
                识别被写作逻辑遗漏、未关联至人物脉络或冲突矩阵的孤立角色。
              </p>
            </div>
          </div>
          <NTag v-if="relationshipRisks.length > 0" size="sm" :variant="getSeverityTag(relationshipRisks[0].severity) as any">
            {{ getSeverityLabel(relationshipRisks[0].severity) }}
          </NTag>
          <NTag v-else size="sm" variant="success">
            正常
          </NTag>
        </div>

        <div class="mt-3 min-h-[90px] flex flex-col justify-between">
          <div v-if="relationshipRisks.length > 0" class="space-y-2">
            <p class="text-xs text-text-secondary leading-relaxed">
              {{ relationshipRisks[0].message }}
            </p>
            <div v-if="relationshipRisks[0].suggestions && relationshipRisks[0].suggestions.length > 0" class="rounded bg-bg-subtle p-2">
              <div class="text-[9px] text-text-muted font-semibold uppercase">
                建议对策
              </div>
              <ul class="mt-1 list-disc list-inside text-[10px] text-text-secondary space-y-1">
                <li v-for="s in relationshipRisks[0].suggestions" :key="s">
                  {{ s }}
                </li>
              </ul>
            </div>
          </div>
          <div v-else class="flex flex-1 items-center justify-center gap-2 text-xs text-green-600">
            <ShieldCheck :size="16" /> 角色人物网互联紧密，冲突点布局清晰
          </div>

          <div v-if="relationshipRisks.length > 0" class="mt-3 flex justify-end">
            <router-link :to="relationshipRisks[0].targetRoute">
              <NButton size="sm" variant="primary">
                {{ relationshipRisks[0].actionLabel }} <Link :size="10" class="ml-1" />
              </NButton>
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.autopilot-health-panel {
  .radar-item {
    background: var(--bg-surface);
  }
  .risk-card {
    background: var(--bg-surface);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(var(--color-primary-rgb, 99, 102, 241), 0.08);
      border-color: rgba(var(--color-primary-rgb, 99, 102, 241), 0.2);
    }
  }
}
</style>
