<script setup lang="ts">
import type { ProjectStatus } from '@ai-novel/shared'
import {
  NInput,
  NPanel,
  NSelect,
  NTextArea,
} from '@ai-novel/ui'

defineProps<{
  titleError: string
  statusOptions: { label: string, value: string }[]
  projectStatusModel: string | number
}>()

const emit = defineEmits<{
  'update:projectStatusModel': [value: string | number]
}>()

const form = defineModel<{
  title: string
  description: string
  genre: string
  theme: string
  targetWords: string
  targetAudience: string
  styleProfile: string
  status: ProjectStatus
}>({ required: true })
</script>

<template>
  <NPanel title="基础信息" description="定义作品的名称、简介和基础分类。">
    <div class="grid gap-4 md:grid-cols-2">
      <div class="md:col-span-2">
        <NInput
          v-model="form.title"
          label="项目名称"
          placeholder="例如：镜中城回声"
          :error="titleError"
        />
      </div>

      <NInput
        v-model="form.genre"
        label="作品类型"
        placeholder="例如：悬疑、奇幻、科幻"
      />

      <NInput
        v-model="form.theme"
        label="核心主题"
        placeholder="例如：记忆、身份与选择的代价"
      />

      <div class="md:col-span-2">
        <NTextArea
          v-model="form.description"
          label="项目简介"
          placeholder="用几句话说明作品的核心设定、主角困境和故事承诺。"
          :rows="4"
        />
      </div>
    </div>
  </NPanel>

  <NPanel title="写作目标" description="统一管理作品状态、目标字数和目标读者。">
    <div class="grid gap-4 md:grid-cols-3">
      <NSelect
        :model-value="projectStatusModel"
        label="项目状态"
        :options="statusOptions"
        @update:model-value="emit('update:projectStatusModel', $event)"
      />

      <NInput
        v-model="form.targetWords"
        label="目标字数"
        type="number"
        placeholder="例如：200000"
      />

      <NInput
        v-model="form.targetAudience"
        label="目标读者"
        placeholder="例如：喜欢都市悬疑的成年读者"
      />
    </div>
  </NPanel>

  <NPanel title="风格配置" description="给 AI 和作者自己一个稳定的语言风格锚点。">
    <NTextArea
      v-model="form.styleProfile"
      label="写作风格说明"
      placeholder="例如：冷静克制、意象密集、节奏偏快；避免过度解释，保留悬疑留白。"
      :rows="6"
    />
  </NPanel>
</template>
