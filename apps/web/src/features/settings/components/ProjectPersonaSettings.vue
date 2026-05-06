<script setup lang="ts">
import {
  NButton,
  NInput,
  NPanel,
  NSelect,
  NTextArea,
} from '@ai-novel/ui'
import { Eye, Sparkles } from 'lucide-vue-next'

defineProps<{
  publishedPersonas: any[]
  personaOptions: { label: string, value: string }[]
  saving: boolean
  loadingPreview: boolean
  preview: string | null
}>()

const emit = defineEmits<{
  save: []
  preview: []
}>()

const personaForm = defineModel<{
  personaId: string
  strength: string
  enabledForOutline: boolean
  enabledForDraft: boolean
  enabledForPolish: boolean
  enabledForQualityReview: boolean
  projectOverrides: string
}>({ required: true })
</script>

<template>
  <NPanel title="写作人格" description="绑定已发布的写作人格，按场景控制人格注入。">
    <div v-if="publishedPersonas.length === 0">
      <p class="text-sm text-text-muted">
        尚无已发布写作人格。请先到写作人格库生成并发布人格。
      </p>
    </div>
    <template v-else>
      <div class="grid gap-4 md:grid-cols-2">
        <NSelect
          v-model="personaForm.personaId"
          label="选择人格"
          :options="personaOptions"
          placeholder="请选择已发布人格"
        />
        <NInput
          v-model="personaForm.strength"
          label="人格强度 (0-100)"
          type="number"
          placeholder="65"
        />
      </div>
      <div class="grid grid-cols-2 mt-4 gap-3 md:grid-cols-4">
        <label class="flex items-center gap-2 text-sm text-text-secondary">
          <input v-model="personaForm.enabledForOutline" type="checkbox" class="rounded">
          应用于大纲
        </label>
        <label class="flex items-center gap-2 text-sm text-text-secondary">
          <input v-model="personaForm.enabledForDraft" type="checkbox" class="rounded">
          应用于正文
        </label>
        <label class="flex items-center gap-2 text-sm text-text-secondary">
          <input v-model="personaForm.enabledForPolish" type="checkbox" class="rounded">
          应用于润色
        </label>
        <label class="flex items-center gap-2 text-sm text-text-secondary">
          <input v-model="personaForm.enabledForQualityReview" type="checkbox" class="rounded">
          应用于质量评估
        </label>
      </div>
      <NTextArea
        v-model="personaForm.projectOverrides"
        label="项目覆盖说明"
        placeholder="针对本项目的个性化补充说明，将覆盖人格默认规则。"
        :rows="3"
        class="mt-4"
      />

      <div v-if="preview" class="mt-4 border border-ai/10 rounded-lg bg-ai-soft/30 p-3">
        <div class="mb-1 flex items-center gap-1.5 text-xs text-ai font-bold">
          <Sparkles :size="12" /> 注入提示预览
        </div>
        <pre class="whitespace-pre-wrap text-xs text-text-secondary leading-relaxed">{{ preview }}</pre>
      </div>
    </template>

    <template #footer>
      <div v-if="publishedPersonas.length > 0" class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs text-text-muted">
          人格将在大纲、正文、润色、质量评估等场景按开关注入 AI 上下文。
        </p>
        <div class="flex justify-end gap-2">
          <NButton variant="secondary" :loading="loadingPreview" @click="emit('preview')">
            <Eye :size="14" class="mr-1.5" />
            预览注入规则
          </NButton>
          <NButton variant="primary" :disabled="!personaForm.personaId" :loading="saving" @click="emit('save')">
            保存人格配置
          </NButton>
        </div>
      </div>
    </template>
  </NPanel>
</template>
