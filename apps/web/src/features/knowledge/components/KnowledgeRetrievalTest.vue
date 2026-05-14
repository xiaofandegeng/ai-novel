<script setup lang="ts">
import type { RetrievalResult } from '../../../api/retrieval'
import { NButton, NInput, NPanel, NTag, useToast } from '@ai-novel/ui'
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  HelpCircle,
  History,
  Search,
  Target,
  User,
  Zap,
} from 'lucide-vue-next'
import { ref } from 'vue'
import { retrievalApi } from '../../../api/retrieval'

const props = defineProps<{
  projectId: string
}>()

const toast = useToast()
const query = ref('')
const searching = ref(false)
const results = ref<RetrievalResult[]>([])
const terms = ref<string[]>([])
const errorMessage = ref('')

async function handleSearch() {
  if (!query.value.trim())
    return

  searching.value = true
  errorMessage.value = ''
  try {
    const data = await retrievalApi.test(props.projectId, query.value)
    results.value = data.results
    terms.value = data.terms
    if (results.value.length === 0) {
      errorMessage.value = '没有找到相关知识片段'
    }
  }
  catch (e: any) {
    console.error(e)
    const msg = e.message || '检索失败，请检查知识库分析状态或 AI 配置'
    errorMessage.value = msg
    toast.add(msg, 'error')
  }
  finally {
    searching.value = false
  }
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'character': return User
    case 'bible': return BookOpen
    case 'memory': return History
    case 'fact': return Zap
    default: return BookOpen
  }
}

function getSourceColor(source: string) {
  switch (source) {
    case 'character': return 'text-orange-500'
    case 'bible': return 'text-purple-500'
    case 'memory': return 'text-blue-500'
    case 'fact': return 'text-yellow-500'
    default: return 'text-primary'
  }
}
</script>

<template>
  <div class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
    <div class="border border-primary/20 rounded-2xl bg-primary/5 p-6">
      <div class="mb-4 flex items-center gap-3">
        <Target class="text-primary" :size="24" />
        <div>
          <h2 class="text-lg text-text-primary font-bold">
            RAG 检索诊断工具
          </h2>
          <p class="text-xs text-text-muted">
            测试多路融合检索算法（Keyword 45%, Vector 25%, Recency 20%, Importance 10%）
          </p>
        </div>
      </div>

      <div class="flex gap-3">
        <div class="flex-1">
          <NInput
            v-model="query"
            label=""
            placeholder="输入搜索词或场景描述，测试 RAG 召回..."
            @keyup.enter="handleSearch"
          />
        </div>
        <NButton variant="primary" :loading="searching" @click="handleSearch">
          <Search class="mr-2" :size="16" />
          运行测试
        </NButton>
      </div>

      <div v-if="terms.length > 0" class="mt-4 flex flex-wrap gap-2">
        <span class="py-1 text-[10px] text-text-muted font-bold uppercase">提取关键词:</span>
        <NTag v-for="t in terms" :key="t" size="sm" variant="default">
          {{ t }}
        </NTag>
      </div>
    </div>

    <div v-if="results.length > 0" class="space-y-4">
      <div v-for="r in results" :key="r.id" class="group">
        <NPanel class="border-l-4 p-5 transition-all hover:border-primary/40" :style="{ borderLeftColor: `var(--color-primary)` }">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 space-y-3">
              <div class="flex items-center gap-2">
                <component :is="getSourceIcon(r.source)" :size="16" :class="getSourceColor(r.source)" />
                <h3 class="text-text-primary font-bold">
                  {{ r.title }}
                </h3>
                <NTag size="sm" variant="ai">
                  {{ Math.round(r.score * 100) }} 分
                </NTag>
              </div>

              <p class="line-clamp-3 text-sm text-text-secondary leading-relaxed">
                {{ r.summary }}
              </p>

              <div class="flex flex-wrap gap-2">
                <span v-for="reason in r.reasons" :key="reason" class="border border-border-light rounded-full bg-bg-page px-2 py-0.5 text-[10px] text-text-muted">
                  {{ reason }}
                </span>
              </div>
            </div>

            <div class="w-48 shrink-0 border-l border-border-light pl-4 space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-[10px] text-text-muted font-bold uppercase">权重分配</span>
                <BarChart3 :size="12" class="text-text-muted" />
              </div>

              <div class="space-y-2">
                <div v-for="(val, key) in r.scoreBreakdown" :key="key" class="space-y-1">
                  <div class="flex justify-between text-[10px]">
                    <span class="text-text-muted capitalize">{{ key }}</span>
                    <span class="font-mono">{{ Math.round(val * 100) }}%</span>
                  </div>
                  <div class="h-1 w-full overflow-hidden rounded-full bg-bg-page">
                    <div
                      class="h-full bg-primary transition-all duration-1000"
                      :style="{ width: `${val * 100}%`, opacity: val > 0 ? 1 : 0.2 }"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </NPanel>
      </div>
    </div>

    <div v-if="searching" class="bg-bg-card/30 animate-pulse border-2 border-primary/20 rounded-2xl border-dashed py-20 text-center">
      <Zap :size="48" class="mx-auto mb-4 text-primary/40" />
      <h3 class="text-text-primary font-bold">
        正在检索...
      </h3>
      <p class="mt-1 text-sm text-text-muted">
        正在从知识库、章节记忆和人物设定中融合检索结果
      </p>
    </div>

    <div v-else-if="errorMessage" class="bg-bg-card/30 border-destructive/20 border-2 rounded-2xl border-dashed py-20 text-center">
      <AlertCircle :size="48" class="text-destructive/40 mx-auto mb-4" />
      <h3 class="text-text-primary font-bold">
        {{ errorMessage }}
      </h3>
      <p class="mt-1 text-sm text-text-muted">
        请尝试调整搜索词，或检查 AI 服务连接状态
      </p>
    </div>

    <div v-else-if="results.length === 0" class="bg-bg-card/30 border-2 border-border-light rounded-2xl border-dashed py-20 text-center">
      <HelpCircle :size="48" class="mx-auto mb-4 text-text-muted/20" />
      <h3 class="text-text-primary font-bold">
        暂无测试结果
      </h3>
      <p class="mt-1 text-sm text-text-muted">
        在上方输入搜索词来评估检索器的召回效果
      </p>
    </div>
  </div>
</template>
