<script setup lang="ts">
import type { CockpitChapterDetail } from '@ai-novel/shared'
import { NButton, NDrawer, NTextArea } from '@ai-novel/ui'
import {
  AlertCircle,
  CheckCircle,
  FileText,
  HelpCircle,
  Layers,
  List,
  Save,
} from 'lucide-vue-next'
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  projectId: string
  chapterId: string
  chapterDetail: CockpitChapterDetail | null
  initialTab?: 'content' | 'outline' | 'scenes'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', text: string): void
}>()

const activeTab = ref<'content' | 'outline' | 'scenes'>('content')

// 备份正文用于编辑
const draftText = ref('')

watch(
  () => props.chapterDetail?.content,
  (val) => {
    draftText.value = val || ''
  },
  { immediate: true },
)

watch(
  () => props.initialTab,
  (val) => {
    if (val) {
      activeTab.value = val
    }
  },
  { immediate: true },
)

// 使用现成的保存逻辑或直接 emit 保存
function handleSaveContent() {
  emit('save', draftText.value)
}
</script>

<template>
  <NDrawer
    :model-value="modelValue"
    :title="chapterDetail ? `第 ${chapterDetail.chapterNumber} 章：${chapterDetail.title}` : '章节详情'"
    width="680px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="chapterDetail" class="chapter-detail-container h-full flex flex-col">
      <!-- 选项卡导航 -->
      <div class="tabs-nav mb-4 flex border-b">
        <button
          class="tab-btn flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors"
          :class="activeTab === 'content' ? 'active-tab text-primary border-primary' : 'text-text-secondary border-transparent'"
          @click="activeTab = 'content'"
        >
          <FileText :size="15" />
          章节正文
        </button>
        <button
          class="tab-btn flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors"
          :class="activeTab === 'outline' ? 'active-tab text-primary border-primary' : 'text-text-secondary border-transparent'"
          @click="activeTab = 'outline'"
        >
          <List :size="15" />
          大纲与总结
        </button>
        <button
          class="tab-btn flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors"
          :class="activeTab === 'scenes' ? 'active-tab text-primary border-primary' : 'text-text-secondary border-transparent'"
          @click="activeTab = 'scenes'"
        >
          <Layers :size="15" />
          拆分场景 ({{ chapterDetail.scenes?.length || 0 }})
        </button>
      </div>

      <!-- 标签内容区域 -->
      <div class="tab-content min-h-[400px] flex-1 overflow-y-auto">
        <!-- 章节正文编辑/展示 -->
        <div v-if="activeTab === 'content'" class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-xs text-text-muted">正文共 {{ draftText.length }} 字</span>
            <NButton variant="primary" size="sm" class="save-btn" @click="handleSaveContent">
              <Save :size="13" /> 保存修改
            </NButton>
          </div>
          <NTextArea
            v-model="draftText"
            label="章节正文"
            placeholder="正文内容生成中或暂未生成..."
            :max-height="800"
            class="text-editor w-full border rounded-lg bg-[#fbf9f5] p-3 text-base text-[#2c1d11] leading-relaxed font-serif"
          />
        </div>

        <!-- 大纲与总结 -->
        <div v-else-if="activeTab === 'outline'" class="space-y-4">
          <div class="info-section border rounded-lg bg-bg-subtle/30 p-4">
            <h4 class="mb-2 text-xs text-primary font-bold">
              本章剧情大纲
            </h4>
            <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
              {{ chapterDetail.notes || '暂无大纲数据' }}
            </p>
          </div>
          <div class="info-section border rounded-lg bg-bg-subtle/30 p-4">
            <h4 class="mb-2 text-xs text-primary font-bold">
              章节内容总结
            </h4>
            <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
              {{ chapterDetail.summary || '暂无内容总结' }}
            </p>
          </div>
        </div>

        <!-- 场景列表 -->
        <div v-else-if="activeTab === 'scenes'" class="space-y-3">
          <div
            v-for="(scene, idx) in chapterDetail.scenes"
            :key="scene.id"
            class="scene-card border rounded-lg bg-[#fcfcfc] p-4 transition-shadow space-y-2 hover:shadow-sm"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs text-primary font-bold">场景 {{ idx + 1 }}</span>
              <div class="flex items-center gap-1">
                <CheckCircle v-if="scene.status === 'completed'" class="text-green" :size="14" />
                <AlertCircle v-else-if="scene.status === 'failed'" class="text-red" :size="14" />
                <HelpCircle v-else class="text-text-muted" :size="14" />
                <span class="text-xs text-text-secondary">{{ scene.status === 'completed' ? '已写完' : scene.status === 'failed' ? '失败' : '规划中' }}</span>
              </div>
            </div>
            <h4 class="text-sm text-text-primary font-bold">
              {{ scene.title }}
            </h4>
            <p class="border border-border-light/50 rounded bg-bg-subtle/40 p-2.5 text-xs text-text-secondary leading-relaxed">
              {{ scene.summary || '无场景大意总结' }}
            </p>
            <div v-if="scene.content" class="scene-content mt-2 border-t pt-2.5">
              <h5 class="mb-1 text-[11px] text-text-muted font-bold tracking-wider uppercase">
                正文片段预览
              </h5>
              <p class="line-clamp-3 text-xs text-[#4b5563] leading-relaxed">
                {{ scene.content }}
              </p>
            </div>
          </div>
          <div v-if="!chapterDetail.scenes || chapterDetail.scenes.length === 0" class="py-6 text-center text-xs text-text-muted">
            暂无拆分场景数据
          </div>
        </div>
      </div>
    </div>
    <div v-else class="flex items-center justify-center py-10">
      <span class="text-xs text-text-muted">数据加载中...</span>
    </div>
  </NDrawer>
</template>

<style lang="scss" scoped>
.chapter-detail-container {
  .tabs-nav {
    border-color: var(--border-light, #e5e7eb);

    .tab-btn {
      cursor: pointer;
      background: none;

      &.active-tab {
        border-bottom-color: var(--primary, #3b82f6);
      }

      &:hover {
        color: var(--primary, #3b82f6);
      }
    }
  }

  .save-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .text-editor {
    font-family: inherit;
    line-height: 1.6;
    border: 1px solid var(--border-light, #e5e7eb);
    border-radius: 0.5rem;
    outline: none;

    &:focus {
      border-color: var(--primary, #3b82f6);
      box-shadow: 0 0 0 2px var(--primary-soft, #eff6ff);
    }
  }

  .info-section {
    border-color: var(--border-light, #e5e7eb);
  }

  .scene-card {
    border-color: var(--border-light, #e5e7eb);

    .scene-content {
      border-color: var(--border-light, #e5e7eb);
    }
  }
}

.text-green {
  color: #10b981;
}
.text-red {
  color: #ef4444;
}
</style>
