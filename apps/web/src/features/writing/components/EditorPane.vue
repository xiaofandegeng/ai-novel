<script setup lang="ts">
import type { Chapter } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import { Sparkles } from 'lucide-vue-next'
import { ref } from 'vue'

defineProps<{
  loading: boolean
  currentChapter: Chapter | undefined
  currentChapterId: string
  projectId: string
  saving: boolean
  wordCount: number
}>()

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'snapshot'): void
  (e: 'selection', payload: { text: string, start: number, end: number }): void
  (e: 'runAi', type: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft'): void
}>()

const draft = defineModel<string>({ required: true })

const editorRef = ref<HTMLTextAreaElement | null>(null)
const showFloatingBar = ref(false)
const selectedText = ref('')
const selectionStart = ref(0)
const selectionEnd = ref(0)

function handleSelection(e: Event) {
  const el = e.target as HTMLTextAreaElement
  const start = el.selectionStart
  const end = el.selectionEnd

  if (start !== end) {
    selectedText.value = el.value.substring(start, end)
    selectionStart.value = start
    selectionEnd.value = end

    showFloatingBar.value = true
  }
  else {
    showFloatingBar.value = false
  }

  emit('selection', {
    text: selectedText.value,
    start: selectionStart.value,
    end: selectionEnd.value,
  })
}

function triggerAI(type: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft') {
  showFloatingBar.value = false
  emit('runAi', type)
}

defineExpose({
  selectedText,
  selectionStart,
  selectionEnd,
  editorRef,
})
</script>

<template>
  <main class="flex-1 overflow-y-auto scroll-smooth px-4 pb-32 pt-16">
    <div v-if="loading" class="h-64 flex items-center justify-center">
      <div class="flex items-center gap-2 text-text-muted">
        <div class="h-4 w-4 animate-spin border-2 border-primary border-t-transparent rounded-full" />
        加载章节中…
      </div>
    </div>

    <div v-else-if="!currentChapterId" class="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
      <svg xmlns="http://www.w3.org/2000/svg" class="mb-4 h-16 w-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      <p>请选择一个章节开始创作</p>
    </div>

    <div v-else class="mx-auto max-w-[760px] space-y-12">
      <!-- Chapter Title Display -->
      <div class="text-center space-y-2">
        <div class="text-[10px] text-text-muted font-bold tracking-[0.2em] uppercase">
          第 {{ currentChapter?.chapterNumber }} 章
        </div>
        <h1 class="text-2xl text-text-primary leading-tight font-writing md:text-3xl">
          {{ currentChapter?.title }}
        </h1>
        <div class="mt-4 flex items-center justify-center gap-2">
          <slot name="version-history" />
        </div>
        <div class="bg-border-default mx-auto mt-6 h-0.5 w-12" />
      </div>

      <!-- Slot for AI Pending Result Panel -->
      <slot name="ai-pending-result" />

      <!-- Editor Plane -->
      <div class="relative rounded-lg focus-within:ring-2 focus-within:ring-primary/20">
        <textarea
          ref="editorRef"
          v-model="draft"
          aria-label="章节正文编辑器"
          class="min-h-[600px] w-full resize-none border-none bg-transparent text-lg text-text-primary leading-[2] font-writing placeholder:text-text-muted/30 focus:outline-none"
          placeholder="从这里开始写作..."
          @select="handleSelection"
        />

        <!-- Empty State AI Button -->
        <div v-if="!draft && !loading" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg-page/40 backdrop-blur-[1px]">
          <div class="border border-ai/20 rounded-2xl bg-bg-surface/80 p-8 shadow-2xl space-y-4">
            <div class="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-ai-soft text-ai">
              <Sparkles :size="24" />
            </div>
            <div class="text-center">
              <h3 class="text-base text-text-primary font-bold">
                快速开始起草
              </h3>
              <p class="mt-1 text-xs text-text-muted leading-relaxed">
                我将根据您的大纲和设定，自动撰写本章初稿
              </p>
            </div>
            <NButton variant="ai" class="w-full shadow-lg" @click="triggerAI('draft')">
              <Sparkles :size="16" class="mr-2" /> AI 起草初稿
            </NButton>
          </div>
        </div>

        <!-- Floating Toolbar -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
        >
          <div
            v-if="showFloatingBar"
            class="border-border-default absolute z-50 flex items-center gap-1 border rounded-lg bg-bg-surface p-1 shadow-lg"
            :style="{ top: `-48px`, left: `50%`, transform: 'translateX(-50%)' }"
          >
            <NButton size="sm" variant="ai" class="h-8 px-2 py-0 text-[10px]" @click="triggerAI('continue')">
              <Sparkles :size="10" class="mr-1" /> 续写
            </NButton>
            <div class="mx-1 h-4 w-px bg-border-light" />
            <NButton size="sm" variant="ghost" class="h-8 px-2 py-0 text-[10px]" @click="triggerAI('polish')">
              润色
            </NButton>
            <NButton size="sm" variant="ghost" class="h-8 px-2 py-0 text-[10px]" @click="triggerAI('expand')">
              扩写
            </NButton>
            <NButton size="sm" variant="ghost" class="h-8 px-2 py-0 text-[10px]" @click="triggerAI('shorten')">
              精简
            </NButton>
            <button class="p-1.5 text-text-muted hover:text-text-primary" aria-label="关闭浮动工具栏" @click="showFloatingBar = false">
              <svg xmlns="http://www.w3.org/2000/svg" :size="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>
        </Transition>
      </div>

      <!-- Bottom Indicator -->
      <div class="flex items-center justify-center pb-10 pt-20 opacity-30">
        <div class="flex gap-2">
          <div v-for="i in 3" :key="i" class="h-1.5 w-1.5 rounded-full bg-text-muted" />
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.font-writing {
  font-family: serif;
}
textarea {
  min-height: calc(100vh - 300px);
}
</style>
