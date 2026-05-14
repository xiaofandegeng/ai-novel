<script setup lang="ts">
import { NButton, NTextArea } from '@ai-novel/ui'
import { MessageSquare, Star } from 'lucide-vue-next'
import { ref } from 'vue'

const props = defineProps<{
  projectId: string
  chapterId?: string
  contextSnapshotId?: string
  modelProvider: string
  modelName: string
  taskType: string
}>()

const emit = defineEmits(['submitted'])

const rating = ref(0)
const comment = ref('')
const selectedTags = ref<string[]>([])
const submitting = ref(false)
const submitted = ref(false)

const issueTags = [
  { id: 'ooc', label: '人物走形' },
  { id: 'plot_drift', label: '情节离谱' },
  { id: 'style_drift', label: '文风不对' },
  { id: 'weak_conflict', label: '冲突薄弱' },
  { id: 'too_generic', label: 'AI味重' },
  { id: 'logic_error', label: '逻辑错误' },
]

function toggleTag(tagId: string) {
  const index = selectedTags.value.indexOf(tagId)
  if (index === -1) {
    selectedTags.value.push(tagId)
  }
  else {
    selectedTags.value.splice(index, 1)
  }
}

async function handleSubmit(accepted: boolean) {
  if (rating.value === 0 && !accepted)
    return

  submitting.value = true
  try {
    const response = await fetch('/api/ai-quality-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: props.projectId,
        chapterId: props.chapterId,
        contextSnapshotId: props.contextSnapshotId,
        modelProvider: props.modelProvider,
        modelName: props.modelName,
        taskType: props.taskType,
        ratingOverall: rating.value || (accepted ? 5 : 1),
        issueTags: selectedTags.value,
        comment: comment.value,
        accepted: accepted ? 1 : 0,
      }),
    })

    if (response.ok) {
      submitted.value = true
      emit('submitted')
    }
  }
  catch (err) {
    console.error('Failed to submit feedback:', err)
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="border border-border-light rounded-xl bg-bg-surface p-4 shadow-sm transition-all hover:shadow-md">
    <div v-if="!submitted" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold">
          <MessageSquare :size="16" class="text-primary" />
          AI 输出质量反馈
        </h3>
        <span class="text-[10px] text-text-muted tracking-wider uppercase">{{ taskType }}</span>
      </div>

      <div class="flex items-center gap-1">
        <Star
          v-for="i in 5"
          :key="i"
          :size="20"
          class="cursor-pointer transition-colors"
          :class="i <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-border-light hover:text-yellow-200'"
          @click="rating = i"
        />
        <span class="ml-2 text-xs text-text-muted">{{ rating > 0 ? `${rating} 分` : '点击评分' }}</span>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="tag in issueTags"
          :key="tag.id"
          class="rounded-full px-2.5 py-1 text-[11px] font-medium transition-all"
          :class="selectedTags.includes(tag.id)
            ? 'bg-primary/10 text-primary border border-primary/20'
            : 'bg-bg-subtle text-text-muted border border-transparent hover:border-border-light'"
          @click="toggleTag(tag.id)"
        >
          {{ tag.label }}
        </button>
      </div>

      <NTextArea
        v-model="comment"
        label="附加反馈"
        placeholder="还有什么具体建议吗？（可选）"
        :rows="2"
        class="text-xs"
      />

      <div class="flex gap-2">
        <NButton
          size="sm"
          class="flex-1"
          variant="secondary"
          :loading="submitting"
          @click="handleSubmit(true)"
        >
          采纳并提交
        </NButton>
        <NButton
          size="sm"
          class="flex-1"
          variant="ghost"
          :loading="submitting"
          @click="handleSubmit(false)"
        >
          丢弃并反馈
        </NButton>
      </div>
    </div>
    <div v-else class="flex flex-col items-center justify-center py-6 text-center">
      <div class="mb-2 h-10 w-10 flex items-center justify-center rounded-full bg-green-50 text-green-500">
        <Star :size="24" class="fill-current" />
      </div>
      <p class="text-sm text-text-primary font-bold">
        感谢反馈！
      </p>
      <p class="mt-1 text-xs text-text-muted">
        你的评分将帮助我们调优模型和提示词。
      </p>
    </div>
  </div>
</template>
