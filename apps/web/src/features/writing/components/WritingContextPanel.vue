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
}>()

const emit = defineEmits<{
  (e: 'applyAI', content: string): void
  (e: 'consistencyCheck', payload: { report?: any, loading: boolean }): void
  (e: 'runAI', type: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft'): void
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

const aiContext = computed(() =>
  `Setting: ${props.storyBible?.worldview || ''}. Current Chapter Outline: ${props.chapter?.goals || ''}`,
)

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
      <div v-if="activeContextTab === 'outline'" class="space-y-6">
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
      <div v-if="activeContextTab === 'characters'" class="space-y-4">
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
      <div v-if="activeContextTab === 'bible'" class="space-y-6">
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
      <div v-if="activeContextTab === 'ai'" class="h-full">
        <AIAssistantSidebar
          ref="aiSidebarRef"
          :project-id="projectId"
          :chapter-id="chapter?.id"
          :scene-id="sceneId"
          :context="aiContext"
          :scene="pendingScene"
          @apply="emit('applyAI', $event)"
          @consistency-check="emit('consistencyCheck', $event)"
          @run-a-i="emit('runAI', $event)"
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
