<script setup lang="ts">
import type { Chapter, ChapterElement, Character, StoryBible } from '@ai-novel/shared'
import { NTag } from '@ai-novel/ui'
import { BookOpen, ChevronRight, ScrollText, Sparkles, Users } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { getCharacterRoleLabel } from '../../../utils/character-labels'
import AIAssistantSidebar from '../../ai-assistant/components/AIAssistantSidebar.vue'

type AIScene = 'outline' | 'draft' | 'polish' | 'quality' | 'chat'

const props = defineProps<{
  chapter: Chapter | undefined
  characters: Character[]
  storyBible: StoryBible | null | undefined
  chapterElements: ChapterElement[]
  projectId: string
  sceneId?: string | null
  projectSummary?: string
  storyPath?: string
}>()

const emit = defineEmits<{
  (e: 'applyAI', content: string, metadata?: { provider?: string, model?: string, requestId?: string }): void
  (e: 'insertAi', content: string, metadata?: { provider?: string, model?: string, requestId?: string }): void
  (e: 'consistencyCheck', payload: { report?: any, loading: boolean }): void
  (e: 'runAi', type: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft'): void
  (e: 'streamAI', content: string, metadata?: { provider?: string, model?: string, requestId?: string }): void
}>()

const activeContextTab = ref('outline')

const tabs = [
  { id: 'outline', label: '大纲', icon: ScrollText },
  { id: 'characters', label: '人物', icon: Users },
  { id: 'bible', label: '世界', icon: BookOpen },
  { id: 'ai', label: 'AI', icon: Sparkles },
]

const aiSidebarRef = ref<InstanceType<typeof AIAssistantSidebar> | null>(null)
const pendingScene = ref<AIScene>('chat')

const presentCharacters = computed(() => {
  if (!props.chapter?.characters)
    return []
  try {
    const ids = JSON.parse(props.chapter.characters)
    return props.characters.filter(c => ids.includes(c.id))
  }
  catch { return [] }
})

const mustAppearCharacters = computed(() =>
  props.chapterElements.filter(e => e.elementType === 'character' && e.relationType === 'appears'),
)

const keyEvents = computed(() =>
  props.chapterElements.filter(e => e.elementType === 'event' && e.relationType === 'occurs'),
)

const otherElements = computed(() =>
  props.chapterElements.filter(e =>
    !(e.elementType === 'character' && e.relationType === 'appears')
    && !(e.elementType === 'event' && e.relationType === 'occurs'),
  ),
)

const aiContext = computed(() => {
  const parts = []

  // 0. Global Project Context (Anchor)
  if (props.projectSummary) {
    parts.push(`### 作品全局背景（核心锚点）\n${props.projectSummary}`)
  }

  // 0.5 Narrative History (Path)
  if (props.storyPath) {
    parts.push(`### 前情提要（叙事路径）\n${props.storyPath}`)
  }

  // 1. World Setting & Global Conflict
  if (props.storyBible) {
    let world = '### 世界观与宏观轨迹\n'
    if (props.storyBible.worldview)
      world += `设定：${props.storyBible.worldview}\n`
    if (props.storyBible.rules)
      world += `铁律与禁忌：${props.storyBible.rules}\n`
    if (props.storyBible.mainConflict)
      world += `核心冲突（整本书的引擎）：${props.storyBible.mainConflict}\n`
    if (props.storyBible.timeline)
      world += `故事时间轴：${props.storyBible.timeline}\n`
    parts.push(world)
  }

  // 2. Chapter Goals & Psychological Journey
  if (props.chapter) {
    let goals = '### 本章创作目标与心理路程\n'
    if (props.chapter.goals)
      goals += `本章核心目标：${props.chapter.goals}\n`
    if (props.chapter.events)
      goals += `剧情大纲：${props.chapter.events}\n`
    if (props.chapter.emotionalArc)
      goals += `情感/心理弧光流向：${props.chapter.emotionalArc}\n`
    if (props.chapter.conflicts)
      goals += `本章冲突点：${props.chapter.conflicts}\n`
    if (props.chapter.endingHook)
      goals += `结尾悬念：${props.chapter.endingHook}\n`
    parts.push(goals)
  }

  // 3. Present Characters Deep Psychology
  if (presentCharacters.value.length > 0) {
    let chars = '### 登场人物深度设定（驱动内核）\n'
    presentCharacters.value.forEach((c) => {
      chars += `- **${c.name}** (${getCharacterRoleLabel(c.role)})\n`
      if (c.personality)
        chars += `  性格外显：${c.personality}\n`
      if (c.goal)
        chars += `  当前动机：${c.goal}\n`
      if (c.arc)
        chars += `  人物弧光（成长/转变轨迹）：${c.arc}\n`
      if (c.desire)
        chars += `  内在欲望：${c.desire}\n`
      if (c.fear)
        chars += `  深层恐惧：${c.fear}\n`
      if (c.weakness)
        chars += `  性格弱点：${c.weakness}\n`
      if (c.secret)
        chars += `  隐秘（创作参考）：${c.secret}\n`
    })
    parts.push(chars)
  }

  // 4. Hard Constraints
  if (props.chapterElements.length > 0) {
    let elements = '### 创作硬约束（必须体现）\n'
    const charConstraints = mustAppearCharacters.value.map(e => e.elementName).join('、')
    const eventConstraints = keyEvents.value.map(e => e.elementName).join('、')
    const otherConstraints = otherElements.value.map(e => e.elementName).join('、')

    if (charConstraints)
      elements += `- 必须出场：${charConstraints}\n`
    if (eventConstraints)
      elements += `- 关键事件：${eventConstraints}\n`
    if (otherConstraints)
      elements += `- 包含元素：${otherConstraints}\n`
    parts.push(elements)
  }

  return parts.join('\n')
})

function sendMessageToAI(prompt: string, scene: AIScene = 'chat') {
  pendingScene.value = scene
  if (activeContextTab.value !== 'ai') {
    activeContextTab.value = 'ai'
  }
  setTimeout(() => {
    if (aiSidebarRef.value) {
      aiSidebarRef.value.sendMessage(prompt)
    }
  }, 100)
}

defineExpose({
  activeContextTab,
  sendMessageToAI,
})
</script>

<template>
  <aside class="hidden w-90 shrink-0 flex-col border-l border-border-light bg-bg-surface xl:flex">
    <!-- Tabs Header -->
    <div class="flex border-b border-border-light bg-bg-page/50 p-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="flex flex-1 items-center justify-center gap-2 rounded-md px-1 py-2 text-xs font-bold tracking-wider uppercase transition-all"
        :class="activeContextTab === tab.id ? 'bg-bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'"
        @click="activeContextTab = tab.id"
      >
        <component :is="tab.icon" :size="14" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab Content -->
    <div class="flex-1 overflow-y-auto p-6 space-y-6">
      <!-- Outline Tab -->
      <div v-show="activeContextTab === 'outline'" class="space-y-6">
        <div v-if="chapter?.goals">
          <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
            创作目标
          </h4>
          <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
            {{ chapter.goals }}
          </p>
        </div>
        <div v-if="chapter?.events">
          <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
            关键事件
          </h4>
          <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
            {{ chapter.events }}
          </p>
        </div>
        <div v-if="chapter?.endingHook">
          <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
            结尾悬念
          </h4>
          <p class="whitespace-pre-wrap text-sm text-primary leading-relaxed italic">
            {{ chapter.endingHook }}
          </p>
        </div>

        <!-- Chapter Elements (hard constraints) -->
        <div v-if="chapterElements.length > 0" class="space-y-3">
          <h4 class="border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
            本章硬约束
          </h4>
          <div v-if="mustAppearCharacters.length > 0">
            <span class="mb-1 block text-[9px] text-text-muted font-bold uppercase">必须出场人物</span>
            <div class="flex flex-wrap gap-1.5">
              <NTag v-for="el in mustAppearCharacters" :key="el.id" size="sm" variant="primary">
                {{ el.elementName }}
              </NTag>
            </div>
          </div>
          <div v-if="keyEvents.length > 0">
            <span class="mb-1 block text-[9px] text-text-muted font-bold uppercase">关键事件</span>
            <div class="flex flex-wrap gap-1.5">
              <NTag v-for="el in keyEvents" :key="el.id" size="sm" variant="ai">
                {{ el.elementName }}
              </NTag>
            </div>
          </div>
          <div v-if="otherElements.length > 0">
            <span class="mb-1 block text-[9px] text-text-muted font-bold uppercase">其他元素</span>
            <div class="flex flex-wrap gap-1.5">
              <NTag v-for="el in otherElements" :key="el.id" size="sm">
                {{ el.elementName }}
              </NTag>
            </div>
          </div>
        </div>
        <div v-else class="rounded-md bg-bg-subtle px-3 py-2 text-xs text-text-muted italic">
          本章尚未配置结构化元素
        </div>
      </div>

      <!-- Characters Tab -->
      <div v-show="activeContextTab === 'characters'" class="space-y-4">
        <div v-if="presentCharacters.length === 0" class="py-10 text-center opacity-30">
          <Users :size="48" class="mx-auto mb-2" />
          <p class="text-xs">
            本章未关联角色。
          </p>
        </div>
        <div
          v-for="char in presentCharacters"
          :key="char.id"
          class="border border-border-light rounded-xl bg-bg-page/30 p-4 space-y-3"
        >
          <div class="flex items-center gap-2">
            <div class="h-2 w-2 rounded-full bg-primary/40" />
            <span class="text-sm text-text-primary font-bold">{{ char.name }}</span>
            <NTag v-if="char.role" size="sm" variant="ai">
              {{ getCharacterRoleLabel(char.role) }}
            </NTag>
          </div>
          <div class="space-y-2">
            <div v-if="char.personality" class="text-xs">
              <span class="block text-[9px] text-text-muted font-bold uppercase">性格特征</span>
              <p class="line-clamp-2 text-text-secondary leading-relaxed">
                {{ char.personality }}
              </p>
            </div>
            <div v-if="char.goal" class="text-xs">
              <span class="block text-[9px] text-text-muted font-bold uppercase">核心目标</span>
              <p class="text-text-secondary leading-relaxed">
                {{ char.goal }}
              </p>
            </div>
            <div v-if="char.secret" class="border border-ai/5 rounded bg-ai-soft/30 p-2 text-xs">
              <span class="block text-[9px] text-ai font-bold uppercase">不为人知的秘密</span>
              <p class="text-ai/80 leading-relaxed italic">
                {{ char.secret }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Bible Tab -->
      <div v-show="activeContextTab === 'bible'" class="space-y-6">
        <div v-if="storyBible?.worldview">
          <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
            世界观设定
          </h4>
          <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
            {{ storyBible.worldview }}
          </p>
        </div>
        <div v-if="storyBible?.rules">
          <h4 class="mb-2 border-b border-border-light pb-1 text-[10px] text-text-muted font-bold tracking-widest uppercase">
            铁律与禁忌
          </h4>
          <p class="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
            {{ storyBible.rules }}
          </p>
        </div>
      </div>

      <!-- AI Tab -->
      <div v-show="activeContextTab === 'ai'" class="h-full">
        <AIAssistantSidebar
          ref="aiSidebarRef"
          :project-id="projectId"
          :chapter-id="chapter?.id"
          :scene-id="sceneId"
          :context="aiContext"
          :scene="pendingScene"
          @apply="(content, metadata) => emit('applyAI', content, metadata)"
          @insert="(content, metadata) => emit('insertAi', content, metadata)"
          @consistency-check="emit('consistencyCheck', $event)"
          @run-ai="emit('runAi', $event)"
          @stream="(content, metadata) => emit('streamAI', content, metadata)"
        />
      </div>
    </div>

    <!-- AI Assistant Footer -->
    <div v-if="activeContextTab !== 'ai'" class="border-t border-border-light bg-bg-page/30 p-4">
      <div
        class="group flex cursor-pointer items-center gap-3 border border-ai/10 rounded-lg bg-ai-soft/50 p-3 transition-colors hover:bg-ai-soft"
        @click="activeContextTab = 'ai'"
      >
        <Sparkles :size="18" class="text-ai" />
        <div class="flex-1">
          <p class="text-[10px] text-ai font-bold uppercase">
            AI 创作辅助
          </p>
          <p class="text-xs text-text-secondary">
            随时为你续写、润色或提炼灵感。
          </p>
        </div>
        <ChevronRight :size="14" class="text-ai opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </div>
  </aside>
</template>
