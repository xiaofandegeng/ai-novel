<script setup lang="ts">
import type { ConsistencyGuardReport } from '@ai-novel/shared'
import { AI_PROVIDER_PRESETS } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Info,
  Loader2,
  Send,
  Settings,
  Sparkles,
  Trash2,
  User,
  XCircle,
} from 'lucide-vue-next'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchAISettings } from '@/api/settings'
import { useAIAssistantSession } from '../composables/useAIAssistantSession'

const props = defineProps<{
  projectId: string
  context?: string
  scene?: 'outline' | 'draft' | 'polish' | 'quality' | 'chat' | 'story_bible' | 'knowledge' | 'persona_training' | 'persona_drift'
  chapterId?: string
  sceneId?: string | null
}>()

const emit = defineEmits<{
  (e: 'apply', content: string): void
  (e: 'insert', content: string): void
  (e: 'consistencyCheck', payload: { report?: ConsistencyGuardReport, loading: boolean }): void
  (e: 'runAi', type: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft'): void
  (e: 'stream', content: string): void
}>()

const router = useRouter()
const { isStreaming, messages, selectedModel, aiNotConfigured, send, clearChat } = useAIAssistantSession()

const inputMessage = ref('')
const chatContainer = ref<HTMLElement | null>(null)
const availableModels = ref<{ label: string, value: string }[]>([])

onMounted(async () => {
  try {
    const settings = await fetchAISettings()
    const providerPreset = AI_PROVIDER_PRESETS.find(p => p.id === settings.provider)
    if (providerPreset) {
      availableModels.value = providerPreset.models
    }
    else {
      // Fallback: at least show the current model
      availableModels.value = [{ label: settings.model || 'Default Model', value: settings.model }]
    }
  }
  catch {
    // Ignore error
  }
})

function handleQuickAction(type: 'draft' | 'continue' | 'brainstorm') {
  if (type === 'brainstorm') {
    inputMessage.value = '请根据当前大纲和设定，为我发散一下接下来的剧情走向。'
    handleSend()
  }
  else {
    emit('runAi', type as any)
  }
}

watch(() => messages.value[messages.value.length - 1], (last) => {
  if (last && last.role === 'assistant') {
    if (isStreaming.value) {
      scrollToBottom()
      emit('stream', last.content)
    }

    // Notify parent about consistency check status
    if (last.isCheckingConsistency || last.consistencyReport) {
      emit('consistencyCheck', {
        report: last.consistencyReport,
        loading: !!last.isCheckingConsistency,
      })
    }
  }
}, { deep: true })

async function scrollToBottom() {
  await nextTick()
  if (chatContainer.value)
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
}

async function handleSend() {
  if (!inputMessage.value.trim() || isStreaming.value)
    return

  const msg = inputMessage.value.trim()
  inputMessage.value = ''
  scrollToBottom()

  await send(msg, {
    projectId: props.projectId,
    scene: props.scene,
    chapterId: props.chapterId,
    sceneId: props.sceneId || undefined,
    context: props.context,
  })
  scrollToBottom()
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
          class="max-w-[200px] cursor-pointer border-none bg-transparent text-xs text-ai font-bold tracking-wider uppercase focus:ring-0"
        >
          <option v-for="m in availableModels" :key="m.value" :value="m.value">
            {{ m.label }}
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
      <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center px-6 text-center">
        <Bot :size="48" class="mb-4 text-text-muted opacity-40" stroke-width="1" />
        <p class="mb-6 text-xs text-text-muted leading-relaxed opacity-60">
          我是你的创作伙伴。可以让我头脑风暴情节、打磨角色语言，或检查逻辑漏洞。
        </p>

        <div class="grid grid-cols-1 w-full gap-2">
          <NButton variant="ai" size="sm" class="w-full" @click="handleQuickAction('draft')">
            <Sparkles :size="14" class="mr-2" /> 开始起草初稿
          </NButton>
          <div class="grid grid-cols-2 gap-2">
            <NButton variant="ghost" size="sm" @click="handleQuickAction('continue')">
              续写下文
            </NButton>
            <NButton variant="ghost" size="sm" @click="handleQuickAction('brainstorm')">
              灵感发散
            </NButton>
          </div>
        </div>
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

          <!-- Consistency Guard Report -->
          <div v-if="msg.role === 'assistant' && (msg.consistencyReport || msg.isCheckingConsistency)" class="mt-3 border-t border-border-light pt-2">
            <div class="mb-2 flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <Loader2 v-if="msg.isCheckingConsistency" :size="12" class="animate-spin text-ai" />
                <CheckCircle2 v-else-if="msg.consistencyReport?.overallStatus === 'pass'" :size="12" class="text-semantic-success" />
                <AlertTriangle v-else-if="msg.consistencyReport?.overallStatus === 'warning'" :size="12" class="text-semantic-warning" />
                <XCircle v-else :size="12" class="text-semantic-error" />
                <span
                  class="text-[10px] font-bold tracking-wider uppercase" :class="{
                    'text-ai': msg.isCheckingConsistency,
                    'text-semantic-success': msg.consistencyReport?.overallStatus === 'pass',
                    'text-semantic-warning': msg.consistencyReport?.overallStatus === 'warning',
                    'text-semantic-error': msg.consistencyReport?.overallStatus === 'blocked',
                  }"
                >
                  {{ msg.isCheckingConsistency ? '正在进行一致性审查...' : `一致性守卫: ${msg.consistencyReport?.overallStatus === 'pass' ? '通过' : msg.consistencyReport?.overallStatus === 'warning' ? '提醒' : '阻断'}` }}
                </span>
              </div>
              <span v-if="msg.consistencyReport" class="text-[10px] text-text-muted font-mono">{{ msg.consistencyReport.score }}分</span>
            </div>

            <div v-if="msg.consistencyReport?.risks.length" class="mb-2 space-y-1.5">
              <div v-for="(risk, j) in msg.consistencyReport.risks" :key="j" class="group flex items-start gap-1.5 rounded bg-bg-page/50 p-1.5 text-[11px] leading-snug transition-colors hover:bg-bg-page">
                <Info
                  :size="12"
                  class="mt-0.5 shrink-0 cursor-help text-text-muted"
                  :title="risk.evidence || '无具体证据'"
                />
                <div class="flex-1">
                  <span class="mr-1 font-bold" :class="risk.severity === 'high' ? 'text-semantic-error' : risk.severity === 'medium' ? 'text-semantic-warning' : 'text-text-muted'">
                    [{{ risk.type }}]
                  </span>
                  <span class="text-text-secondary">{{ risk.message }}</span>
                </div>
              </div>
            </div>

            <div v-if="msg.consistencyReport?.suggestedFixes.length" class="mt-1 px-1 text-[11px] text-ai italic">
              建议: {{ msg.consistencyReport.suggestedFixes[0] }}
            </div>
          </div>

          <!-- Consistency Guard Failure -->
          <div
            v-if="msg.role === 'assistant' && msg.consistencyCheckFailed"
            class="mt-3 border border-semantic-error/20 rounded-lg bg-semantic-error/10 p-2 text-xs text-semantic-error"
          >
            <div class="mb-1 flex items-center gap-1.5 font-bold">
              <XCircle :size="12" />
              <span>一致性审查失败</span>
            </div>
            <p class="text-[11px] leading-relaxed">
              {{ msg.consistencyCheckError || '请稍后重试' }}。为避免内容偏离设定，当前结果不可直接应用。
            </p>
          </div>
        </div>

        <div v-if="msg.role === 'assistant' && msg.content && !msg.error && !isStreaming && !msg.isCheckingConsistency" class="mt-1.5 flex justify-end gap-2">
          <NButton
            variant="secondary"
            size="sm"
            aria-label="应用 AI 回复到编辑器"
            :disabled="msg.consistencyReport?.overallStatus === 'blocked' || msg.consistencyCheckFailed"
            @click="emit('insert', msg.content)"
          >
            {{
              msg.consistencyCheckFailed
                ? '审查失败'
                : msg.consistencyReport?.overallStatus === 'blocked'
                  ? '检查未通过'
                  : '应用到编辑器'
            }}
          </NButton>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="shrink-0 border-t border-border-light bg-bg-page/30 p-4">
      <div v-if="aiNotConfigured" class="mb-3 flex flex-col gap-3 border border-semantic-warning/20 rounded-lg bg-semantic-warning/10 p-3 sm:flex-row sm:items-start">
        <Settings :size="18" class="mt-0.5 shrink-0 text-semantic-warning" />
        <div>
          <p class="text-sm text-text-primary font-semibold">
            AI 服务未配置
          </p>
          <p class="mt-1 text-xs text-text-secondary">
            请先完成 AI 配置检测后再使用 AI 功能。
          </p>
          <NButton variant="secondary" size="sm" class="mt-2" @click="router.push(`/project/${props.projectId}/settings`)">
            前往项目设置
          </NButton>
        </div>
      </div>
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
