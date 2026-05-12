<script setup lang="ts">
import type { FragmentType, PersonaMemoryFragment } from '@ai-novel/shared'
import {
  NButton,
  NEmptyState,
  NPanel,
  NTag,
  useToast,
} from '@ai-novel/ui'
import { Brain, RefreshCw, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { usePersonaMemoryStore } from '../../../stores/persona-memory.store'

const props = defineProps<{
  projectId: string
}>()

const toast = useToast()
const memoryStore = usePersonaMemoryStore()
const loading = ref(false)

const typeLabel: Record<FragmentType, string> = {
  style_pattern: '风格',
  dialogue_pattern: '对话',
  narrative_preference: '叙事',
  vocabulary_tendency: '词汇',
  pacing_preference: '节奏',
}

const groupedFragments = computed(() => {
  const groups = new Map<FragmentType, PersonaMemoryFragment[]>()
  for (const fragment of memoryStore.fragments) {
    const list = groups.get(fragment.fragmentType) || []
    list.push(fragment)
    groups.set(fragment.fragmentType, list)
  }
  return [...groups.entries()]
})

async function loadFragments() {
  loading.value = true
  try {
    await memoryStore.fetchFragments(props.projectId)
  }
  catch (error) {
    toast.add(error instanceof Error ? error.message : '写作记忆加载失败', 'error')
  }
  finally {
    loading.value = false
  }
}

async function extractFragments() {
  try {
    const created = await memoryStore.extractPatterns(props.projectId)
    if (created.length === 0) {
      toast.add('没有可抽取的已完成章节', 'warning')
      return
    }
    toast.add(`已生成 ${created.length} 条写作记忆`, 'success')
  }
  catch (error) {
    toast.add(error instanceof Error ? error.message : '写作记忆抽取失败', 'error')
  }
}

onMounted(loadFragments)
</script>

<template>
  <NPanel
    title="项目写作记忆"
    description="从已完成章节中沉淀抽象风格、节奏和表达偏好，后续 AI 生成会把它作为本项目自己的写作约束。"
  >
    <template #actions>
      <div class="flex gap-2">
        <NButton size="sm" variant="ghost" :loading="loading" @click="loadFragments">
          <RefreshCw :size="14" class="mr-1" /> 刷新
        </NButton>
        <NButton size="sm" variant="primary" :loading="memoryStore.extracting" @click="extractFragments">
          <Sparkles :size="14" class="mr-1" /> 从已完成章节抽取
        </NButton>
      </div>
    </template>

    <NEmptyState
      v-if="!loading && memoryStore.fragments.length === 0"
      title="暂无写作记忆"
      description="完成章节后，可抽取本项目自己的节奏、风格和语言偏好。"
    >
      <template #icon>
        <Brain :size="28" class="text-text-muted" />
      </template>
    </NEmptyState>

    <div v-else class="space-y-4">
      <div
        v-for="[fragmentType, fragments] in groupedFragments"
        :key="fragmentType"
        class="border border-border-light rounded-md bg-bg-page p-3"
      >
        <div class="mb-2 flex items-center gap-2">
          <NTag size="sm" variant="info">
            {{ typeLabel[fragmentType] }}
          </NTag>
          <span class="text-xs text-text-muted">{{ fragments.length }} 条</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="fragment in fragments"
            :key="fragment.id"
            class="flex items-start justify-between gap-3 text-sm"
          >
            <p class="text-text-secondary leading-relaxed">
              {{ fragment.content }}
            </p>
            <span class="shrink-0 text-xs text-text-muted">
              {{ fragment.confidence }}%
            </span>
          </div>
        </div>
      </div>
    </div>
  </NPanel>
</template>
