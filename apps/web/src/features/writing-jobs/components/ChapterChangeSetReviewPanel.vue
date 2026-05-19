<script setup lang="ts">
import type { ChapterChangeSetDetail } from '@/api/chapter-change-sets'
import { NButton, NLoadingState, NTag } from '@ai-novel/ui'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Info,
  Layers,
  User,
  XCircle,
  Zap,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { fetchChangeSetDetail } from '@/api/chapter-change-sets'

const props = defineProps<{
  projectId: string
  changeSetId: string
}>()

const loading = ref(true)
const changeSet = ref<ChapterChangeSetDetail | null>(null)
const error = ref<string | null>(null)

async function loadDetail() {
  loading.value = true
  error.value = null
  try {
    changeSet.value = await fetchChangeSetDetail(props.projectId, props.changeSetId)
  }
  catch (err: any) {
    error.value = err.message || '加载详情失败'
  }
  finally {
    loading.value = false
  }
}

onMounted(loadDetail)

function riskVariant(level: string): 'error' | 'warning' | 'success' {
  if (level === 'high')
    return 'error'
  if (level === 'medium')
    return 'warning'
  return 'success'
}

function getItemIcon(type: string) {
  switch (type) {
    case 'draft': return BookOpen
    case 'character_create':
    case 'character_update': return User
    case 'relationship_create':
    case 'relationship_update': return Layers
    case 'conflict_create':
    case 'conflict_update': return Zap
    default: return Info
  }
}
</script>

<template>
  <div class="change-set-review-panel">
    <div v-if="loading" class="flex justify-center py-10">
      <NLoadingState message="加载变更详情..." />
    </div>

    <div v-else-if="error" class="flex items-center gap-2 py-4 text-red-500">
      <XCircle :size="16" /> {{ error }}
      <NButton size="sm" @click="loadDetail">
        重试
      </NButton>
    </div>

    <div v-else-if="changeSet" class="space-y-4">
      <!-- Risk Summary Header -->
      <div
        class="flex items-center gap-3 border rounded-md p-3"
        :class="{
          'bg-red-50 border-red-100 text-red-800': changeSet.riskLevel === 'high',
          'bg-amber-50 border-amber-100 text-amber-800': changeSet.riskLevel === 'medium',
          'bg-green-50 border-green-100 text-green-800': changeSet.riskLevel === 'low',
        }"
      >
        <AlertTriangle v-if="changeSet.riskLevel === 'high' || changeSet.riskLevel === 'medium'" :size="20" />
        <CheckCircle2 v-else :size="20" />

        <div class="flex-1">
          <div class="flex items-center gap-2 text-sm font-bold">
            风险评估：{{ changeSet.riskLevel === 'high' ? '高风险' : changeSet.riskLevel === 'medium' ? '中风险' : '低风险' }}
            <NTag :variant="(riskVariant(changeSet.riskLevel) as any)" size="sm">
              {{ changeSet.riskLevel.toUpperCase() }}
            </NTag>
          </div>
          <div class="mt-1 text-xs opacity-90">
            {{ changeSet.riskSummary || '未检测到显著异常' }}
          </div>
        </div>
      </div>

      <!-- Change Items -->
      <div class="space-y-2">
        <div class="flex items-center gap-1 px-1 text-xs text-text-muted font-semibold">
          <ChevronRight :size="12" /> 变更明细 ({{ changeSet.items?.length || 0 }})
        </div>

        <div class="space-y-3">
          <div
            v-for="item in changeSet.items"
            :key="item.id"
            class="overflow-hidden border border-border-light rounded-md bg-bg-surface"
          >
            <div class="flex items-center gap-2 border-b border-border-light bg-bg-subtle px-3 py-2">
              <component :is="getItemIcon(item.itemType)" :size="14" class="text-text-secondary" />
              <span class="text-sm font-medium">{{ item.title }}</span>
              <NTag
                v-if="item.riskLevel !== 'low'"
                :variant="(riskVariant(item.riskLevel) as any)"
                size="sm"
                class="ml-auto"
              >
                {{ item.riskLevel === 'high' ? '高' : '中' }}
              </NTag>
            </div>

            <div class="p-3">
              <!-- Draft content preview -->
              <div v-if="item.itemType === 'draft'" class="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-bg-subtle p-2 text-xs text-text-secondary leading-relaxed">
                {{ item.payloadJson.content }}
              </div>

              <!-- Memory summary -->
              <div v-else-if="item.itemType === 'chapter_memory'" class="text-xs space-y-2">
                <div v-if="item.payloadJson.summary" class="rounded bg-bg-subtle p-2 text-text-secondary italic">
                  {{ item.payloadJson.summary }}
                </div>
                <div v-if="item.payloadJson.keyEvents" class="grid grid-cols-1 gap-1">
                  <div class="text-text-muted font-medium">
                    关键事件：
                  </div>
                  <div class="pl-2 text-text-secondary">
                    {{ item.payloadJson.keyEvents }}
                  </div>
                </div>
              </div>

              <!-- Generic payload view -->
              <div v-else class="rounded bg-bg-subtle p-2 text-xs">
                <pre class="overflow-x-auto text-[10px] text-text-muted">{{ JSON.stringify(item.payloadJson, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Consistency Details -->
      <div v-if="changeSet.consistencyReportJson" class="mt-4 border-t border-border-light pt-4">
        <div class="mb-2 px-1 text-xs text-text-muted font-semibold">
          一致性检查报告
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div
            v-for="(val, key) in changeSet.consistencyReportJson"
            v-show="typeof val === 'object' && val.status"
            :key="key"
            class="border border-border-light rounded bg-bg-subtle p-2"
          >
            <div class="text-[10px] text-text-muted uppercase">
              {{ key }}
            </div>
            <div class="mt-1 flex items-center justify-between">
              <span class="text-xs font-medium">{{ (val as any).score }}分</span>
              <NTag :variant="(val as any).status === 'pass' ? 'success' : 'warning'" size="sm">
                {{ (val as any).status }}
              </NTag>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="py-10 text-center">
      <div class="text-sm text-text-muted">
        未找到变更集
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.change-set-review-panel {
  width: 100%;
}

.review-item {
  :deep(.n-collapse-item__header) {
    padding: 4px 8px !important;
  }
}
</style>
