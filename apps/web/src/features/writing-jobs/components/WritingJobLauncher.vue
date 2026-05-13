<script setup lang="ts">
import type { WritingJobMode } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import { Bot } from 'lucide-vue-next'
import { computed, watch } from 'vue'
import { useChapterStore } from '../../../stores/chapter.store'
import { useSceneStore } from '../../../stores/scene.store'
import { MODE_LABEL } from '../composables/useWritingJobController'

defineProps<{
  creating: boolean
}>()

const emit = defineEmits<{
  create: []
}>()

const form = defineModel<WritingJobMode>({ required: true })
const formChapterId = defineModel<string | null>('chapterId', { required: true })
const formSceneId = defineModel<string | null>('sceneId', { required: true })

const chapterStore = useChapterStore()
const sceneStore = useSceneStore()

const chapters = computed(() => chapterStore.chapters)
const scenes = computed(() => sceneStore.scenes)

watch(formChapterId, async (id) => {
  formSceneId.value = null
  if (id) {
    try {
      await sceneStore.fetchScenes(chapterStore.chapters[0]?.projectId || '', id)
    }
    catch {}
  }
  else {
    sceneStore.clear()
  }
})

watch(form, (mode) => {
  if (mode !== 'scene_draft') {
    formChapterId.value = null
    formSceneId.value = null
  }
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

    <div v-if="form === 'scene_draft'" class="space-y-3">
      <div>
        <label class="mb-1 block text-xs text-text-muted">选择章节</label>
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
      <div v-if="formChapterId">
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

    <div class="flex justify-end">
      <NButton
        :loading="creating"
        :disabled="form === 'scene_draft' && (!formChapterId || !formSceneId)"
        @click="emit('create')"
      >
        创建任务
      </NButton>
    </div>
  </div>
</template>
