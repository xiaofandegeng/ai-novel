<script setup lang="ts">
import { NButton, NInput, NLoadingState } from '@ai-novel/ui'
import { Brain, Search, Target } from 'lucide-vue-next'
import { ref } from 'vue'
import { useKnowledgeStore } from '@/stores/knowledge.store'

const props = defineProps<{
  projectId: string
}>()

interface RetrievalResult {
  title: string
  summary: string
  score: number
  reasons: string[]
  techniques?: string
}

const knowledgeStore = useKnowledgeStore()
const query = ref('')
const loading = ref(false)
const results = ref<RetrievalResult[]>([])

async function handleSearch() {
  if (!query.value.trim())
    return

  loading.value = true
  try {
    results.value = await knowledgeStore.testRetrieval(props.projectId, query.value)
  }
  catch (err) {
    console.error('Retrieval test failed:', err)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="border border-border-light rounded-xl bg-bg-surface/50 p-6 shadow-inner backdrop-blur-sm space-y-6">
    <div class="flex gap-3">
      <div class="flex-1">
        <NInput
          v-model="query"
          label="语义搜索测试"
          placeholder="输入查询语句，测试语义召回效果..."
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <Search :size="18" class="text-text-muted" />
          </template>
        </NInput>
      </div>
      <NButton :loading="loading" variant="primary" @click="handleSearch">
        测试检索
      </NButton>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <NLoadingState />
    </div>

    <div v-else-if="results.length > 0" class="space-y-4">
      <div v-for="(res, idx) in results" :key="idx" class="border border-border-light rounded-lg bg-bg-surface p-4 transition-all hover:shadow-md">
        <div class="mb-2 flex items-start justify-between">
          <div class="flex items-center gap-2">
            <h4 class="text-text-primary font-bold">
              {{ res.title }}
            </h4>
            <span class="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">
              Score: {{ Math.round(res.score * 100) }}%
            </span>
          </div>
          <div class="flex gap-1">
            <span v-for="reason in res.reasons" :key="reason" class="inline-flex items-center rounded-md bg-bg-muted px-1.5 py-0.5 text-[9px] text-text-secondary font-medium">
              {{ reason }}
            </span>
          </div>
        </div>
        <p class="line-clamp-3 mb-3 text-sm text-text-secondary leading-relaxed">
          {{ res.summary }}
        </p>
        <div v-if="res.techniques" class="border-l-2 border-primary/40 rounded bg-bg-subtle p-3 text-xs text-text-muted">
          <div class="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase">
            <Brain :size="12" /> 写作技巧
          </div>
          {{ res.techniques }}
        </div>
      </div>
    </div>

    <div v-else-if="query && !loading" class="py-12 text-center opacity-40">
      <Target :size="48" class="mx-auto mb-3" />
      <p>未找到相关知识召回</p>
    </div>

    <div v-else class="py-8 text-center text-xs italic opacity-30">
      <p>RAG 检索测试将综合评估关键词匹配、语义相似度和图谱关联度。</p>
    </div>
  </div>
</template>
