<script setup lang="ts">
import type { ChapterStatus, Character } from '@ai-novel/shared'
import {
  NButton,
  NTextArea,
} from '@ai-novel/ui'
import {
  Info,
  Plus,
  Users,
} from 'lucide-vue-next'

defineProps<{
  characters: Character[]
  saving: boolean
}>()

const emit = defineEmits<{
  save: []
  toggleCharacter: [charId: string]
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
          <input
            v-model="form.title"
            class="w-full border-none bg-transparent p-0 text-3xl text-text-primary font-bold focus:outline-none focus:ring-0"
            placeholder="章节标题"
          >
        </div>
        <div class="flex items-center gap-4">
          <div class="h-6 w-px bg-border-light" />
          <div class="flex items-center gap-2">
            <span class="mr-2 text-xs text-text-muted font-bold uppercase">Status</span>
            <select
              v-model="form.status"
              class="border border-border-light rounded-md bg-bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
      <h3 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
        <Users :size="16" /> 登场角色
      </h3>
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
