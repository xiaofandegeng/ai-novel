<script setup lang="ts">
import { BookOpen, Layers } from 'lucide-vue-next'

defineProps<{
  uploading: boolean
}>()

const emit = defineEmits<{
  upload: [file: File]
}>()

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length)
    return

  emit('upload', input.files[0])
  input.value = ''
}
</script>

<template>
  <div class="border-border-default flex items-center justify-between border rounded-lg border-dashed bg-bg-page/50 p-4">
    <div class="flex items-center gap-4">
      <BookOpen class="text-primary" :size="32" />
      <div>
        <h3 class="text-sm text-text-primary font-bold">
          研习经典
        </h3>
        <p class="text-xs text-text-muted">
          上传并分析现有小说，提炼其写作技法。
        </p>
      </div>
    </div>
    <label class="flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm text-white font-bold shadow-sm transition-all hover:bg-primary/90">
      <span v-if="uploading" class="h-4 w-4 animate-spin border-2 border-white/30 border-t-white rounded-full" />
      <template v-else>
        <Layers :size="18" /> 上传素材 (.txt)
      </template>
      <input type="file" accept=".txt" class="hidden" :disabled="uploading" @change="handleFileChange">
    </label>
  </div>
</template>
