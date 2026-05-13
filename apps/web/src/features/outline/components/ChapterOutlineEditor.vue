<script setup lang="ts">
import type { ChapterStatus, Character, CreateChapterElementInput } from '@ai-novel/shared'
import {
  NButton,
  NTextArea,
} from '@ai-novel/ui'
import {
  Info,
  Layers,
  Plus,
  Sparkles,
  Users,
  X,
} from 'lucide-vue-next'
import ChapterTitleField from './ChapterTitleField.vue'

defineProps<{
  characters: Character[]
  saving: boolean
  isBrainstorming: boolean
  chapterElementDrafts: CreateChapterElementInput[]
  newEventName: string
}>()

const emit = defineEmits<{
  'save': []
  'toggleCharacter': [charId: string]
  'brainstorm': []
  'addCharacterElement': [charId: string]
  'removeElement': [index: number]
  'addEventElement': []
  'update:newEventName': [value: string]
}>()

const form = defineModel<{
  title: string
  goals: string
  conflicts: string
  events: string
  emotionalArc: string
  foreshadowing: string
  endingHook: string
  status: ChapterStatus
  characterIds: string[]
}>({ required: true })

const statusOptions = [
  { value: 'not_started', label: '未开始' },
  { value: 'planning', label: '规划中' },
  { value: 'writing', label: '写作中' },
  { value: 'completed', label: '已完成' },
]
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-12">
    <header class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <ChapterTitleField v-model="form.title" />
        </div>
        <div class="flex items-center gap-4">
          <NButton variant="ai" size="sm" :loading="isBrainstorming" @click="emit('brainstorm')">
            <Sparkles :size="16" class="mr-1.5" /> AI 灵感风暴
          </NButton>
          <div class="h-6 w-px bg-border-light" />
          <div class="flex items-center gap-2">
            <span class="mr-2 text-xs text-text-muted font-bold">状态</span>
            <select
              v-model="form.status"
              aria-label="章节状态"
              class="border border-border-light rounded-md bg-bg-surface px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus:ring-1 focus-visible:ring-primary/20 focus:ring-primary"
            >
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </header>

    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
          <Users :size="16" /> 登场角色
        </h3>
        <span class="text-xs text-text-muted">勾选后将自动加入 AI 写作硬约束</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="char in characters"
          :key="char.id"
          class="flex items-center gap-2 border rounded-full px-3 py-1.5 text-xs font-medium transition-all"
          :class="form.characterIds.includes(char.id)
            ? 'bg-primary text-white border-primary shadow-sm'
            : 'bg-bg-surface text-text-muted border-border-light hover:border-text-muted'"
          @click="emit('toggleCharacter', char.id)"
        >
          {{ char.name }}
          <Plus v-if="!form.characterIds.includes(char.id)" :size="10" />
        </button>
      </div>
    </section>

    <!-- Chapter Structured Elements -->
    <section class="space-y-4">
      <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
        <Layers :size="16" /> AI 写作硬约束
      </h3>
      <div>
        <label class="mb-2 block text-xs text-text-muted font-semibold">必须出场人物 (Character Constraints)</label>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="(el, idx) in chapterElementDrafts.filter(e => e.elementType === 'character')"
            :key="idx"
            class="flex items-center gap-1 border border-primary/30 rounded-full bg-primary-soft px-3 py-1 text-xs text-primary"
            :title="el.importance === 'major' ? '核心角色' : '普通角色'"
          >
            {{ el.elementName }}
            <button class="text-primary/60 hover:text-primary" @click="emit('removeElement', chapterElementDrafts.indexOf(el))">
              <X :size="12" />
            </button>
          </span>
          <button
            v-for="char in characters.filter(c => !chapterElementDrafts.some(e => e.elementType === 'character' && e.elementId === c.id))"
            :key="char.id"
            class="flex items-center gap-1 border border-border-light rounded-full bg-bg-surface px-3 py-1 text-xs text-text-muted transition-colors hover:border-primary hover:text-primary"
            @click="emit('addCharacterElement', char.id)"
          >
            <Plus :size="10" /> {{ char.name }}
          </button>
        </div>
      </div>
      <div>
        <label class="mb-2 block text-xs text-text-muted font-semibold">关键事件</label>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="(el, idx) in chapterElementDrafts.filter(e => e.elementType === 'event')"
            :key="idx"
            class="flex items-center gap-1 border border-ai/30 rounded-full bg-ai-soft px-3 py-1 text-xs text-ai"
          >
            {{ el.elementName }}
            <button class="text-ai/60 hover:text-ai" @click="emit('removeElement', chapterElementDrafts.indexOf(el))">
              <X :size="12" />
            </button>
          </span>
        </div>
        <div class="mt-2 flex gap-2">
          <input
            :value="newEventName"
            class="flex-1 border border-border-light rounded-md bg-bg-surface px-3 py-1.5 text-xs"
            placeholder="输入关键事件名称"
            @input="emit('update:newEventName', ($event.target as HTMLInputElement).value)"
            @keydown.enter="emit('addEventElement')"
          >
          <NButton size="sm" variant="ghost" :disabled="!newEventName.trim()" @click="emit('addEventElement')">
            <Plus :size="14" class="mr-1" /> 添加事件
          </NButton>
        </div>
      </div>
    </section>

    <div class="space-y-8">
      <div class="grid gap-8">
        <NTextArea
          v-model="form.goals"
          label="本章创作目标"
          placeholder="本章必须发生什么？需要揭露哪些信息？"
          :rows="3"
        />

        <div class="grid gap-8 md:grid-cols-2">
          <NTextArea
            v-model="form.conflicts"
            label="核心冲突"
            placeholder="外部干扰或内心博弈..."
            :rows="4"
          />
          <NTextArea
            v-model="form.emotionalArc"
            label="情感基调"
            placeholder="读者应该感受到什么？情绪如何转变？"
            :rows="4"
          />
        </div>

        <NTextArea
          v-model="form.events"
          label="关键事件（剧情拆解）"
          placeholder="1. 主角到达...&#10;2. 冲突爆发...&#10;3. 发现关键线索..."
          :rows="8"
        />

        <div class="grid gap-8 md:grid-cols-2">
          <NTextArea
            v-model="form.foreshadowing"
            label="伏笔与铺垫"
            placeholder="为后续情节埋下的细节..."
            :rows="4"
          />
          <NTextArea
            v-model="form.endingHook"
            label="结尾悬念 (Hook)"
            placeholder="引向下一章的悬念或转折点..."
            :rows="4"
          />
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between border-t border-border-light pt-8">
      <p class="flex items-center gap-2 text-xs text-text-muted italic">
        <Info :size="14" /> AI 在生成初稿时将参考这些细节作为叙事蓝图。
      </p>
      <NButton variant="primary" :loading="saving" @click="emit('save')">
        更新大纲设定
      </NButton>
    </div>
  </div>
</template>
