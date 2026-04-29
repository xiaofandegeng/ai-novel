<script setup lang="ts">
import { NButton } from '@ai-novel/ui'
import {
  Bot,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-vue-next'
import { nextTick, ref } from 'vue'
import { chatStream } from '../api/ai'

const props = defineProps<{
  projectId: string
  context?: string
}>()

const emit = defineEmits<{
  (e: 'apply', content: string): void
}>()
const messages = ref<{ role: 'user' | 'assistant', content: string, model?: string }[]>([])
const inputMessage = ref('')
const selectedModel = ref('gpt-4o-mini')
const isStreaming = ref(false)
const chatContainer = ref<HTMLElement | null>(null)

async function scrollToBottom() {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

async function handleSend() {
  if (!inputMessage.value.trim() || isStreaming.value)
    return

  const userMsg = inputMessage.value.trim()
  messages.value.push({ role: 'user', content: userMsg })
  inputMessage.value = ''
  isStreaming.value = true
  scrollToBottom()

  // Add a placeholder for AI response
  messages.value.push({ role: 'assistant', content: '', model: selectedModel.value })
  const lastIndex = messages.value.length - 1

  try {
    const response = await chatStream(
      [{ role: 'user', content: userMsg }],
      { projectId: props.projectId, context: props.context, model: selectedModel.value },
    )

    if (!response.body)
      throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break

      const chunk = decoder.decode(value)
      messages.value[lastIndex].content += chunk
      scrollToBottom()
    }
  }
  catch (error: any) {
    messages.value[lastIndex].content = `[Error: ${error.message}]`
  }
  finally {
    isStreaming.value = false
  }
}

function clearChat() {
  messages.value = []
}

defineExpose({
  sendMessage: (content: string) => {
    inputMessage.value = content
    handleSend()
  },
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden bg-bg-surface">
    <!-- Header -->
    <div class="flex shrink-0 items-center justify-between border-b border-border-light bg-ai-soft/30 p-4">
      <div class="flex items-center gap-2">
        <Sparkles :size="18" class="text-ai" />
        <select
          v-model="selectedModel"
          class="cursor-pointer border-none bg-transparent text-xs text-ai font-bold tracking-wider uppercase focus:ring-0"
        >
          <option value="gpt-4o-mini">
            GPT-4o Mini
          </option>
          <option value="gpt-4o">
            GPT-4o (Smart)
          </option>
          <option value="claude-3-5-sonnet">
            Claude 3.5
          </option>
        </select>
      </div>
      <button
        v-if="messages.length > 0"
        class="p-1 text-text-muted transition-colors hover:text-semantic-error"
        @click="clearChat"
      >
        <Trash2 :size="14" />
      </button>
    </div>

    <!-- Chat History -->
    <div
      ref="chatContainer"
      class="flex-1 overflow-y-auto scroll-smooth p-4 space-y-4"
    >
      <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center px-6 text-center opacity-40">
        <Bot :size="48" class="mb-4 text-text-muted" stroke-width="1" />
        <p class="text-xs text-text-muted leading-relaxed">
          我是你的创作伙伴。可以让我头脑风暴情节、打磨角色语言，或检查逻辑漏洞。
        </p>
      </div>

      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="flex flex-col space-y-1.5"
        :class="msg.role === 'user' ? 'items-end' : 'items-start'"
      >
        <div class="flex items-center gap-1.5 px-1 text-[10px] text-text-muted font-bold uppercase">
          <template v-if="msg.role === 'assistant'">
            <Sparkles :size="10" class="text-ai" /> AI ({{ msg.model }})
          </template>
          <template v-else>
            <User :size="10" /> You
          </template>
        </div>

        <div
          class="relative max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed"
          :class="msg.role === 'user'
            ? 'bg-bg-subtle text-text-primary rounded-tr-none border border-border-light'
            : 'bg-ai-soft/50 text-text-primary rounded-tl-none border border-ai/10'"
        >
          <div v-if="msg.content" class="whitespace-pre-wrap">
            {{ msg.content }}
          </div>
          <div v-else-if="isStreaming && i === messages.length - 1" class="flex gap-1 py-1">
            <div class="h-1.5 w-1.5 animate-bounce rounded-full bg-ai" />
            <div class="h-1.5 w-1.5 animate-bounce rounded-full bg-ai" style="animation-delay: 0.2s" />
            <div class="h-1.5 w-1.5 animate-bounce rounded-full bg-ai" style="animation-delay: 0.4s" />
          </div>
        </div>
        <div v-if="msg.role === 'assistant' && msg.content && !isStreaming" class="mt-1.5 flex justify-end">
          <NButton
            variant="secondary"
            size="sm"
            aria-label="应用 AI 回复到编辑器"
            @click="emit('apply', msg.content)"
          >
            应用到编辑器
          </NButton>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="shrink-0 border-t border-border-light bg-bg-page/30 p-4">
      <div class="group relative">
        <textarea
          v-model="inputMessage"
          placeholder="输入你的问题或写作指令..."
          rows="3"
          aria-label="输入给 AI 助手的消息"
          class="group-hover:border-border-default w-full resize-none border border-border-light rounded-xl bg-bg-surface py-3 pl-4 pr-12 text-sm shadow-sm transition-all focus:border-ai focus:outline-none focus-visible:ring-2 focus-visible:ring-ai/30"
          @keydown.enter.prevent="handleSend"
        />
        <button
          aria-label="发送消息"
          class="absolute bottom-3 right-3 rounded-lg bg-ai p-2 text-white shadow-md transition-all disabled:cursor-not-allowed hover:bg-ai/90 disabled:opacity-30"
          :disabled="!inputMessage.trim() || isStreaming"
          @click="handleSend"
        >
          <Loader2 v-if="isStreaming" :size="18" class="animate-spin" />
          <Send v-else :size="18" />
        </button>
      </div>
      <p class="mt-2 text-center text-[10px] text-text-muted italic">
        按 Enter 发送，Shift+Enter 换行。
      </p>
    </div>
  </div>
</template>
