<script setup lang="ts">
import type { ChapterScene, SceneStatus } from '@ai-novel/shared'
import { NButton, NTextArea } from '@ai-novel/ui'
import {
  ChevronDown,
  ChevronUp,
  Clapperboard,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'
import { ref } from 'vue'

const props = defineProps<{
  scenes: ChapterScene[]
  isGenerating: boolean
  sceneSuggestion: string | null
}>()

const emit = defineEmits<{
  add: []
  edit: [scene: ChapterScene]
  delete: [id: string]
  reorder: [orders: Array<{ id: string, orderIndex: number }>]
  generate: []
  applySuggestion: [mode: 'append' | 'replace']
  discardSuggestion: []
}>()

const expandedSceneId = ref<string | null>(null)
const showReplaceConfirm = ref(false)

function confirmReplace() {
  if (props.scenes.length === 0) {
    emit('applySuggestion', 'replace')
    return
  }
  showReplaceConfirm.value = true
}

function doReplace() {
  showReplaceConfirm.value = false
  emit('applySuggestion', 'replace')
}

const statusConfig: Record<SceneStatus, { label: string, color: string }> = {
  planned: { label: '已规划', color: 'bg-gray-100 text-gray-600' },
  drafting: { label: '写作中', color: 'bg-blue-100 text-blue-600' },
  reviewed: { label: '待审核', color: 'bg-yellow-100 text-yellow-600' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-600' },
}

const statusOptions: Array<{ value: SceneStatus, label: string }> = [
  { value: 'planned', label: '已规划' },
  { value: 'drafting', label: '写作中' },
  { value: 'reviewed', label: '待审核' },
  { value: 'completed', label: '已完成' },
]

function toggleExpand(id: string) {
  expandedSceneId.value = expandedSceneId.value === id ? null : id
}

function handleFieldChange(scene: ChapterScene, field: string, value: string | number | null) {
  emit('edit', { ...scene, [field]: value })
}

function moveScene(index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= props.scenes.length)
    return
  const orders = props.scenes.map((s, i) => {
    const swap = i === index ? targetIndex : i === targetIndex ? index : i
    return { id: props.scenes[swap].id, orderIndex: i }
  })
  emit('reorder', orders)
}
</script>

<template>
  <section class="mx-auto mt-12 max-w-3xl border-t border-border-light pt-8 space-y-6">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
        <Clapperboard :size="16" /> 场景规划
      </h3>
      <div class="flex items-center gap-2">
        <NButton variant="ai" size="sm" :loading="isGenerating" @click="emit('generate')">
          <Sparkles :size="14" class="mr-1" /> AI 生成场景
        </NButton>
        <NButton variant="ghost" size="sm" @click="emit('add')">
          <Plus :size="14" class="mr-1" /> 添加场景
        </NButton>
      </div>
    </div>

    <div v-if="scenes.length === 0" class="border border-border-light rounded-lg border-dashed py-8 text-center text-xs text-text-muted">
      暂无场景，点击"添加场景"或使用 AI 生成场景规划
    </div>

    <div v-if="sceneSuggestion" class="border border-ai/15 rounded-lg bg-ai-soft p-4">
      <div class="mb-2 flex items-center justify-between">
        <h4 class="flex items-center gap-2 text-sm text-text-primary font-bold">
          <Sparkles :size="14" class="text-ai" /> AI 场景建议
        </h4>
      </div>
      <pre class="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs text-text-secondary leading-relaxed">{{ sceneSuggestion }}</pre>
      <div class="mt-3 flex gap-2">
        <NButton size="sm" variant="ai" @click="emit('applySuggestion', 'append')">
          追加到场景列表
        </NButton>
        <NButton size="sm" variant="primary" @click="confirmReplace">
          替换当前场景列表
        </NButton>
        <NButton size="sm" variant="ghost" @click="emit('discardSuggestion')">
          丢弃
        </NButton>
      </div>
      <!-- Replace confirmation -->
      <div v-if="showReplaceConfirm" class="mt-3 border border-yellow-200 rounded-md bg-yellow-50 p-3">
        <p class="text-xs text-yellow-800">
          替换操作将覆盖当前章节的 {{ scenes.length }} 个场景，此操作不可撤销。确认替换？
        </p>
        <div class="mt-2 flex gap-2">
          <NButton size="sm" variant="primary" @click="doReplace">
            确认替换
          </NButton>
          <NButton size="sm" variant="ghost" @click="showReplaceConfirm = false">
            取消
          </NButton>
        </div>
      </div>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="(scene, index) in scenes"
        :key="scene.id"
        class="border border-border-light rounded-lg bg-bg-surface shadow-sm transition-shadow hover:shadow-sm"
      >
        <!-- Scene header (collapsed) -->
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="flex flex-col items-center gap-0.5">
            <button
              :disabled="index === 0"
              class="text-text-muted/40 hover:text-text-muted disabled:opacity-30"
              @click="moveScene(index, -1)"
            >
              <GripVertical :size="14" />
            </button>
          </div>
          <span class="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10 text-xs text-primary font-bold">
            {{ scene.sceneNumber }}
          </span>
          <input
            :value="scene.title || ''"
            class="flex-1 bg-transparent text-sm text-text-primary font-medium focus:outline-none"
            placeholder="场景标题"
            @change="handleFieldChange(scene, 'title', ($event.target as HTMLInputElement).value)"
          >
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="statusConfig[scene.status].color"
          >
            {{ statusConfig[scene.status].label }}
          </span>
          <button
            class="text-text-muted/40 hover:text-text-primary"
            @click="toggleExpand(scene.id)"
          >
            <component :is="expandedSceneId === scene.id ? ChevronUp : ChevronDown" :size="16" />
          </button>
          <button
            class="text-text-muted/40 hover:text-red-500"
            @click="emit('delete', scene.id)"
          >
            <Trash2 :size="14" />
          </button>
        </div>

        <!-- Expanded detail -->
        <div v-if="expandedSceneId === scene.id" class="border-t border-border-light px-4 py-4 space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <NTextArea
              :model-value="scene.location || ''"
              label="地点"
              placeholder="场景发生的地点"
              :rows="1"
              @update:model-value="handleFieldChange(scene, 'location', $event)"
            />
            <NTextArea
              :model-value="scene.timeline || ''"
              label="时间线"
              placeholder="场景发生的时间"
              :rows="1"
              @update:model-value="handleFieldChange(scene, 'timeline', $event)"
            />
          </div>

          <NTextArea
            :model-value="scene.purpose || ''"
            label="场景目的"
            placeholder="这个场景在叙事中的作用"
            :rows="2"
            @update:model-value="handleFieldChange(scene, 'purpose', $event)"
          />

          <NTextArea
            :model-value="scene.conflict || ''"
            label="场景冲突"
            placeholder="场景内的矛盾或张力"
            :rows="2"
            @update:model-value="handleFieldChange(scene, 'conflict', $event)"
          />

          <NTextArea
            :model-value="scene.summary || ''"
            label="摘要"
            placeholder="场景内容概要"
            :rows="3"
            @update:model-value="handleFieldChange(scene, 'summary', $event)"
          />

          <div class="grid gap-4 md:grid-cols-2">
            <NTextArea
              :model-value="scene.characters || ''"
              label="出场角色"
              placeholder="参与场景的角色"
              :rows="2"
              @update:model-value="handleFieldChange(scene, 'characters', $event)"
            />
            <div class="space-y-2">
              <label class="block text-xs text-text-muted font-semibold">目标字数</label>
              <input
                type="number"
                :value="scene.targetWords || ''"
                class="w-full border border-border-light rounded-md bg-bg-page px-3 py-1.5 text-sm"
                placeholder="目标字数"
                @change="handleFieldChange(scene, 'targetWords', Number(($event.target as HTMLInputElement).value) || null)"
              >
              <label class="block text-xs text-text-muted font-semibold">状态</label>
              <select
                :value="scene.status"
                class="w-full border border-border-light rounded-md bg-bg-page px-3 py-1.5 text-sm"
                @change="handleFieldChange(scene, 'status', ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
