<script setup lang="ts">
import { NButton, NPanel, useToast } from '@ai-novel/ui'
import {
  AlertTriangle,
  BookOpen,
  Download,
  FileText,
  Sparkles,
  Users,
} from 'lucide-vue-next'
import { reactive, ref } from 'vue'
import {
  exportCharacterProfiles,
  exportConflictReport,
  exportForeshadowingReport,
  exportManuscript,
  exportProposal,
} from '../../../api/export'

const props = defineProps<{
  projectId: string
  projectTitle: string
}>()

const toast = useToast()
const exporting = ref(false)

const options = reactive({
  format: 'md' as 'md' | 'txt',
  includeOutline: false,
  includeScenes: true,
  includeUnfinishedChapters: false,
  includeAuthorNotes: false,
})

async function handleExportManuscript() {
  exporting.value = true
  try {
    await exportManuscript(props.projectId, {
      format: options.format,
      includeOutline: options.includeOutline,
      includeScenes: options.includeScenes,
      includeUnfinishedChapters: options.includeUnfinishedChapters,
      includeAuthorNotes: options.includeAuthorNotes,
    })
    toast.add('手稿导出成功', 'success')
  }
  catch (e: any) {
    toast.add(`导出失败: ${e.message}`, 'error')
  }
  finally {
    exporting.value = false
  }
}

async function handleQuickExport(fn: () => Promise<void>, label: string) {
  exporting.value = true
  try {
    await fn()
    toast.add(`${label}导出成功`, 'success')
  }
  catch (e: any) {
    toast.add(`${label}导出失败: ${e.message}`, 'error')
  }
  finally {
    exporting.value = false
  }
}

const quickExports = [
  {
    label: '企划书',
    icon: BookOpen,
    description: '项目概要、世界观、角色一览',
    action: () => exportProposal(props.projectId),
  },
  {
    label: '角色设定集',
    icon: Users,
    description: '所有角色详细档案及人际关系',
    action: () => exportCharacterProfiles(props.projectId),
  },
  {
    label: '伏笔报告',
    icon: Sparkles,
    description: '伏笔铺设与回收状态总览',
    action: () => exportForeshadowingReport(props.projectId),
  },
  {
    label: '矛盾报告',
    icon: AlertTriangle,
    description: '全部冲突线索及参与角色',
    action: () => exportConflictReport(props.projectId),
  },
]
</script>

<template>
  <NPanel title="手稿导出" description="将作品内容导出为可读文档格式，或生成专题分析报告。">
    <div class="space-y-6">
      <!-- Format selector -->
      <div class="space-y-2">
        <label class="text-xs text-text-muted font-bold uppercase">导出格式</label>
        <div class="flex gap-3">
          <button
            class="flex items-center gap-2 border rounded-lg px-4 py-2 text-sm transition-colors"
            :class="options.format === 'md'
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border-light text-text-secondary hover:border-primary/40'"
            @click="options.format = 'md'"
          >
            <FileText :size="16" />
            Markdown (.md)
          </button>
          <button
            class="flex items-center gap-2 border rounded-lg px-4 py-2 text-sm transition-colors"
            :class="options.format === 'txt'
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border-light text-text-secondary hover:border-primary/40'"
            @click="options.format = 'txt'"
          >
            <FileText :size="16" />
            纯文本 (.txt)
          </button>
        </div>
      </div>

      <!-- Toggle options -->
      <div class="space-y-3">
        <label class="text-xs text-text-muted font-bold uppercase">内容选项</label>
        <div class="grid grid-cols-2 gap-3">
          <label
            v-for="opt in [
              { key: 'includeOutline', label: '包含大纲' },
              { key: 'includeScenes', label: '包含场景' },
              { key: 'includeUnfinishedChapters', label: '包含未完成章节' },
              { key: 'includeAuthorNotes', label: '包含作者备注' },
            ]"
            :key="opt.key"
            class="flex cursor-pointer items-center gap-2 border border-border-light rounded-lg px-3 py-2 text-sm transition-colors hover:bg-bg-page/50"
            :class="(options as any)[opt.key] ? 'border-primary/40 bg-primary/5' : ''"
          >
            <input
              v-model="(options as any)[opt.key]"
              type="checkbox"
              class="h-4 w-4 border-border-light rounded text-primary accent-primary"
            >
            <span class="text-text-secondary">{{ opt.label }}</span>
          </label>
        </div>
      </div>

      <!-- Primary export button -->
      <NButton
        :loading="exporting"
        variant="primary"
        class="w-full"
        @click="handleExportManuscript"
      >
        <Download class="mr-2" :size="16" />
        导出手稿
      </NButton>

      <!-- Quick exports -->
      <div class="space-y-3">
        <label class="text-xs text-text-muted font-bold uppercase">快捷导出</label>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="q in quickExports"
            :key="q.label"
            class="group flex flex-col gap-2 border border-border-light rounded-lg p-3 transition-colors hover:border-primary/40"
          >
            <div class="flex items-center gap-2">
              <component :is="q.icon" class="text-text-muted" :size="16" />
              <span class="text-sm text-text-primary font-medium">{{ q.label }}</span>
            </div>
            <p class="text-xs text-text-muted leading-relaxed">
              {{ q.description }}
            </p>
            <NButton
              size="sm"
              variant="secondary"
              :disabled="exporting"
              @click="handleQuickExport(q.action, q.label)"
            >
              <Download class="mr-1" :size="14" />
              导出
            </NButton>
          </div>
        </div>
      </div>
    </div>
  </NPanel>
</template>
