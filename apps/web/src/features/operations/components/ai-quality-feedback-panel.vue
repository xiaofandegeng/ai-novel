<script setup lang="ts">
import { NButton, useToast } from '@ai-novel/ui'
import {
  MessageSquare,
  Star,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-vue-next'
import { ref } from 'vue'
import { aiQualityApi } from '../../../api/ai-quality'

const props = defineProps<{
  projectId: string
  chapterId?: string
  contextSnapshotId?: string
  modelProvider: string
  modelName: string
  taskType: string
  onClose?: () => void
}>()

const toast = useToast()
const rating = ref(0)
const comment = ref('')
const accepted = ref(true)
const selectedTags = ref<string[]>([])
const submitting = ref(false)

const tags = [
  { label: '人设不符', value: 'character_drift' },
  { label: '逻辑错误', value: 'logic_error' },
  { label: '词藻堆砌', value: 'flowery_language' },
  { label: '节奏太慢', value: 'pacing_slow' },
  { label: '事实性错误', value: 'factual_error' },
  { label: '风格一致', value: 'style_match' },
]

function toggleTag(tag: string) {
  const index = selectedTags.value.indexOf(tag)
  if (index > -1) {
    selectedTags.value.splice(index, 1)
  }
  else {
    selectedTags.value.push(tag)
  }
}

async function handleSubmit() {
  if (rating.value === 0) {
    toast.add('请给出评分', 'warning')
    return
  }

  submitting.value = true
  try {
    await aiQualityApi.submitFeedback({
      projectId: props.projectId,
      chapterId: props.chapterId,
      contextSnapshotId: props.contextSnapshotId,
      modelProvider: props.modelProvider,
      modelName: props.modelName,
      taskType: props.taskType,
      ratingOverall: rating.value,
      issueTags: selectedTags.value,
      comment: comment.value,
      accepted: accepted.value ? 1 : 0,
    })
    toast.add('感谢您的反馈！', 'success')
    props.onClose?.()
  }
  catch (e: any) {
    toast.add(`提交失败: ${e.message}`, 'error')
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="animate-in zoom-in-95 border border-border-light rounded-2xl bg-bg-surface p-6 shadow-xl duration-300">
    <div class="mb-6 flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-lg text-text-primary font-bold">
        <MessageSquare class="text-primary" :size="20" />
        AI 生成质量反馈
      </h3>
      <div class="flex items-center gap-2 border border-primary/10 rounded-full bg-primary/5 px-3 py-1">
        <span class="text-[10px] text-primary font-bold uppercase">{{ taskType }}</span>
      </div>
    </div>

    <div class="space-y-6">
      <!-- Overall Rating -->
      <div class="space-y-2">
        <label class="text-xs text-text-muted font-bold uppercase">总体满意度</label>
        <div class="flex gap-2">
          <button
            v-for="i in 5"
            :key="i"
            class="p-2 transition-all"
            @click="rating = i"
          >
            <Star
              :size="32"
              :class="i <= rating ? 'fill-primary text-primary' : 'text-text-muted/30'"
            />
          </button>
        </div>
      </div>

      <!-- Accept Toggle -->
      <div class="space-y-2">
        <label class="text-xs text-text-muted font-bold uppercase">采纳结果</label>
        <div class="flex gap-4">
          <button
            class="flex flex-1 items-center justify-center gap-2 border rounded-xl py-3 transition-all"
            :class="accepted ? 'bg-green-500/10 border-green-500/50 text-green-600' : 'bg-bg-page border-border-light text-text-muted'"
            @click="accepted = true"
          >
            <ThumbsUp :size="18" />
            <span class="font-bold">采纳并继续</span>
          </button>
          <button
            class="flex flex-1 items-center justify-center gap-2 border rounded-xl py-3 transition-all"
            :class="!accepted ? 'bg-red-500/10 border-red-500/50 text-red-600' : 'bg-bg-page border-border-light text-text-muted'"
            @click="accepted = false"
          >
            <ThumbsDown :size="18" />
            <span class="font-bold">弃用并重试</span>
          </button>
        </div>
      </div>

      <!-- Issues Tags -->
      <div class="space-y-2">
        <label class="text-xs text-text-muted font-bold uppercase">具体表现</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="tag in tags"
            :key="tag.value"
            class="border rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
            :class="selectedTags.includes(tag.value) ? 'bg-primary border-primary text-white' : 'bg-bg-page border-border-light text-text-secondary hover:border-primary/50'"
            @click="toggleTag(tag.value)"
          >
            {{ tag.label }}
          </button>
        </div>
      </div>

      <!-- Comments -->
      <div class="space-y-2">
        <label class="text-xs text-text-muted font-bold uppercase">补充建议 (可选)</label>
        <textarea
          v-model="comment"
          class="min-h-[100px] w-full border border-border-light rounded-xl bg-bg-page p-4 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary/20"
          placeholder="有什么可以改进的地方？AI 将学习您的偏好..."
        />
      </div>

      <div class="flex gap-3 pt-4">
        <NButton variant="secondary" class="flex-1" @click="onClose">
          取消
        </NButton>
        <NButton variant="primary" class="flex-1" :loading="submitting" @click="handleSubmit">
          提交反馈
        </NButton>
      </div>
    </div>
  </div>
</template>
