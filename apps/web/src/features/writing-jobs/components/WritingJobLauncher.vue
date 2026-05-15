<script setup lang="ts">
import type { WritingJobMode } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import { Bot } from 'lucide-vue-next'
import { computed, watch } from 'vue'
import { useChapterStore } from '../../../stores/chapter.store'
import { useSceneStore } from '../../../stores/scene.store'
import { MODE_LABEL } from '../composables/useWritingJobController'

const props = defineProps<{
  creating: boolean
  projectId: string
}>()

const emit = defineEmits<{
  create: []
}>()

const form = defineModel<WritingJobMode>({ required: true })
const formChapterId = defineModel<string | null>('chapterId', { required: true })
const formSceneId = defineModel<string | null>('sceneId', { required: true })
const formExecutionMode = defineModel<'manual' | 'auto'>('executionMode', { default: 'manual' })
const formAutoApprovalLevel = defineModel<'conservative' | 'balanced' | 'aggressive'>('autoApprovalLevel', { default: 'conservative' })

const chapterStore = useChapterStore()
const sceneStore = useSceneStore()

const chapters = computed(() => chapterStore.chapters)
const scenes = computed(() => sceneStore.scenes)

watch(formChapterId, async (id) => {
  formSceneId.value = null
  if (id) {
    try {
      await sceneStore.fetchScenes(props.projectId, id)
    }
    catch {}
  }
  else {
    sceneStore.clear()
  }
})

watch(form, (mode) => {
  if (mode === 'outline_only') {
    formChapterId.value = null
    formSceneId.value = null
  }
  else if (!formChapterId.value && chapters.value.length > 0) {
    formChapterId.value = chapters.value[0].id
  }
  if (mode !== 'scene_draft')
    formSceneId.value = null
})

watch(chapters, (items) => {
  if (form.value !== 'outline_only' && !formChapterId.value && items.length > 0)
    formChapterId.value = items[0].id
})

const createDisabled = computed(() => {
  if ((form.value === 'draft_only' || form.value === 'outline_then_draft') && !formChapterId.value)
    return true
  if (form.value === 'scene_draft' && (!formChapterId.value || !formSceneId.value))
    return true
  return false
})
</script>

<template>
  <div class="border border-border-light rounded-lg bg-bg-surface p-6 space-y-4">
    <div class="mb-2 flex items-center gap-3">
      <Bot :size="20" class="text-primary" />
      <h3 class="text-sm text-text-primary font-bold">
        创建写作任务
      </h3>
    </div>

    <div>
      <label class="mb-2 block text-xs text-text-muted">写作模式</label>
      <div class="grid grid-cols-4 gap-3">
        <button
          v-for="(label, mode) in MODE_LABEL"
          :key="mode"
          class="border rounded-lg p-3 text-center text-sm transition-colors"
          :class="form === mode ? 'border-primary bg-primary-soft text-primary' : 'border-border-light text-text-secondary hover:bg-bg-subtle'"
          @click="form = mode as WritingJobMode"
        >
          {{ label }}
        </button>
      </div>
    </div>

    <div>
      <label class="mb-2 block text-xs text-text-muted">执行策略</label>
      <div class="flex gap-3">
        <button
          v-for="mode in ['manual', 'auto'] as const"
          :key="mode"
          class="flex-1 border rounded-lg p-3 text-center text-sm transition-colors"
          :class="formExecutionMode === mode ? 'border-primary bg-primary-soft text-primary' : 'border-border-light text-text-secondary hover:bg-bg-subtle'"
          @click="formExecutionMode = mode"
        >
          {{ mode === 'manual' ? '半自动' : '全自动' }}
        </button>
      </div>
      <p v-if="formExecutionMode === 'auto'" class="mt-2 text-xs text-text-muted leading-relaxed">
        全自动会在低风险条件下自动通过确认点、写入正文、保存快照并运行分析。若发现人物跑偏或逻辑冲突，任务会暂停。
      </p>
    </div>

    <div v-if="formExecutionMode === 'auto'">
      <label class="mb-2 block text-xs text-text-muted">自动确认等级</label>
      <div class="flex gap-3">
        <button
          v-for="level in ['conservative', 'balanced'] as const"
          :key="level"
          class="flex-1 border rounded-lg p-3 text-center text-sm transition-colors"
          :class="formAutoApprovalLevel === level ? 'border-primary bg-primary-soft text-primary' : 'border-border-light text-text-secondary hover:bg-bg-subtle'"
          @click="formAutoApprovalLevel = level"
        >
          {{ level === 'conservative' ? '保守' : '平衡' }}
        </button>
      </div>
    </div>

    <div v-if="form !== 'outline_only'" class="space-y-3">
      <div>
        <label class="mb-1 block text-xs text-text-muted">正文写入章节</label>
        <select
          v-model="formChapterId"
          class="w-full border border-border-light rounded-md bg-bg-page px-3 py-2 text-sm"
        >
          <option :value="null" disabled>
            请选择章节
          </option>
          <option v-for="ch in chapters" :key="ch.id" :value="ch.id">
            {{ ch.title }}
          </option>
        </select>
      </div>
      <div v-if="form === 'scene_draft' && formChapterId">
        <label class="mb-1 block text-xs text-text-muted">选择场景</label>
        <select
          v-model="formSceneId"
          class="w-full border border-border-light rounded-md bg-bg-page px-3 py-2 text-sm"
        >
          <option :value="null" disabled>
            请选择场景
          </option>
          <option v-for="sc in scenes" :key="sc.id" :value="sc.id">
            场景 {{ sc.sceneNumber }}: {{ sc.title || '未命名' }}
          </option>
        </select>
      </div>
    </div>

    <div class="flex justify-end pt-2">
      <NButton
        :loading="creating"
        :disabled="createDisabled"
        @click="emit('create')"
      >
        创建任务
      </NButton>
    </div>
  </div>
</template>
