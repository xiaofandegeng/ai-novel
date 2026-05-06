<script setup lang="ts">
import type { AIProviderPreset } from '@ai-novel/shared'
import {
  NButton,
  NInput,
  NPanel,
  NSelect,
} from '@ai-novel/ui'

defineProps<{
  saving: boolean
  testing: boolean
  aiTestMessage: string
  aiProviderOptions: { label: string, value: string }[]
  currentAIProviderPreset?: AIProviderPreset
  aiModelOptions: { label: string, value: string }[]
  aiProviderModel: string | number
  aiModelSelectModel: string | number
}>()

const emit = defineEmits<{
  'update:aiProviderModel': [value: string | number]
  'update:aiModelSelectModel': [value: string | number]
  'save': []
  'test': []
}>()

const aiForm = defineModel<{
  provider: string
  baseUrl: string
  model: string
  apiKey: string
  temperature: string
  hasApiKey: boolean
}>({ required: true })
</script>

<template>
  <NPanel title="AI 服务配置" description="选择常用 AI 服务源，或使用 OpenAI 兼容接口自定义接入。">
    <div class="grid gap-4 md:grid-cols-2">
      <NSelect
        :model-value="aiProviderModel"
        label="服务类型"
        :options="aiProviderOptions"
        placeholder="选择 AI 服务源"
        @update:model-value="emit('update:aiProviderModel', $event)"
      />

      <NSelect
        :model-value="aiModelSelectModel"
        label="模型建议"
        :options="aiModelOptions"
        placeholder="选择推荐模型"
        @update:model-value="emit('update:aiModelSelectModel', $event)"
      />

      <div class="md:col-span-2">
        <NInput
          v-model="aiForm.baseUrl"
          label="API Base URL"
          placeholder="例如：https://api.openai.com/v1"
        />
      </div>

      <div class="md:col-span-2">
        <NInput
          v-model="aiForm.model"
          label="实际模型名"
          placeholder="例如：gpt-4o-mini / kimi-latest / glm-5.1 / 方舟 endpoint id"
        />
      </div>

      <NInput
        v-model="aiForm.apiKey"
        label="API Key"
        type="password"
        :placeholder="aiForm.hasApiKey ? '已配置，留空则保持不变' : '请输入 API Key'"
      />

      <NInput
        v-model="aiForm.temperature"
        label="温度"
        type="number"
        placeholder="0-100"
      />
    </div>

    <div v-if="currentAIProviderPreset" class="mt-4 border border-border-light rounded-lg bg-bg-subtle p-3">
      <p class="text-sm text-text-primary font-semibold">
        {{ currentAIProviderPreset.label }}
      </p>
      <p class="mt-1 text-xs text-text-secondary leading-relaxed">
        {{ currentAIProviderPreset.description }}
      </p>
      <p class="mt-2 text-xs text-text-muted">
        {{ currentAIProviderPreset.apiKeyHint }}
      </p>
      <p v-if="currentAIProviderPreset.requiresCustomModel" class="mt-1 text-xs text-semantic-warning font-medium">
        该服务的模型名可能需要填写控制台中的实际模型 ID 或 endpoint id。
      </p>
    </div>

    <template #footer>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-col">
          <p class="text-xs text-text-muted">
            {{ aiForm.hasApiKey ? '当前已保存 API Key。为了安全，页面不会回显密钥。' : '当前尚未保存 API Key。' }}
          </p>
          <p v-if="!aiForm.hasApiKey" class="mt-1 text-xs text-semantic-error font-bold">
            请先配置 API Key 以启用 AI 辅助创作功能。
          </p>
          <span v-if="aiTestMessage" class="mt-1 text-xs text-text-secondary">{{ aiTestMessage }}</span>
        </div>
        <div class="flex justify-end gap-2">
          <NButton variant="secondary" :loading="testing" @click="emit('test')">
            检测可用性
          </NButton>
          <NButton variant="primary" :loading="saving" @click="emit('save')">
            保存 AI 配置
          </NButton>
        </div>
      </div>
    </template>
  </NPanel>
</template>
