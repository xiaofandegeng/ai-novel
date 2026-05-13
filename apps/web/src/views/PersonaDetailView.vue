<script setup lang="ts">
import type { WritingPersona } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NLoadingState,
  NPanel,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  Brain,
  Upload,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as personaApi from '../api/persona'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const personaId = route.params.id as string

const loading = ref(true)
const persona = ref<WritingPersona | null>(null)

onMounted(async () => {
  try {
    persona.value = await personaApi.getPersona(personaId)
  }
  catch {
    toast.add('加载人格失败', 'error')
  }
  finally {
    loading.value = false
  }
})

async function handlePublish() {
  try {
    persona.value = await personaApi.publishPersona(personaId)
    toast.add('人格已发布', 'success')
  }
  catch {
    toast.add('发布失败', 'error')
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已归档' }
  return map[status] || status
}

const ruleFields: Array<{ key: keyof WritingPersona, label: string }> = [
  { key: 'coreAppeal', label: '核心爽点' },
  { key: 'pacingRules', label: '节奏规则' },
  { key: 'conflictRules', label: '冲突规则' },
  { key: 'characterRules', label: '人物规则' },
  { key: 'languageRules', label: '语言规则' },
  { key: 'chapterRules', label: '章节规则' },
  { key: 'hookRules', label: '结尾钩子' },
  { key: 'forbiddenRules', label: '禁止事项' },
  { key: 'similarityGuardrails', label: '相似度防护' },
] as const
</script>

<template>
  <NAppLayout project-name="写作人格详情">
    <template #topbar-left>
      <div class="flex items-center gap-4">
        <button class="text-text-muted hover:text-primary" @click="router.push('/persona')">
          <ArrowLeft :size="20" />
        </button>
        <div class="h-6 w-px bg-border-light" />
        <div class="flex items-center gap-2">
          <Brain :size="18" class="text-ai" />
          <span class="text-base text-text-primary font-semibold">{{ persona?.name || '加载中...' }}</span>
        </div>
      </div>
    </template>

    <template #topbar-right>
      <NButton v-if="persona?.status === 'draft'" variant="primary" size="sm" @click="handlePublish">
        <Upload :size="15" />
        发布人格
      </NButton>
    </template>

    <div class="mx-auto max-w-4xl p-8 space-y-6">
      <NLoadingState v-if="loading" />

      <template v-else-if="persona">
        <NPanel title="人格概览" padding>
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <NTag variant="info" size="sm">
                {{ persona.genre || '未设定类型' }}
              </NTag>
              <NTag :variant="persona.status === 'published' ? 'success' : 'warning'" size="sm">
                {{ statusLabel(persona.status) }}
              </NTag>
            </div>
            <p class="text-sm text-text-secondary">
              {{ persona.description || '暂无描述' }}
            </p>
          </div>
        </NPanel>

        <NPanel title="人格规则" padding>
          <div v-if="!persona.coreAppeal" class="py-10 text-center text-sm text-text-muted">
            该人格尚未生成规则。请先从训练集生成。
          </div>
          <div v-else class="space-y-4">
            <div v-for="field in ruleFields" :key="field.key">
              <div class="mb-1 text-xs text-text-muted font-bold tracking-wider uppercase">
                {{ field.label }}
              </div>
              <div class="border border-border-light rounded-lg bg-bg-subtle p-3 text-sm text-text-secondary leading-relaxed">
                {{ persona[field.key] || '未设定' }}
              </div>
            </div>
          </div>
        </NPanel>
      </template>
    </div>
  </NAppLayout>
</template>
