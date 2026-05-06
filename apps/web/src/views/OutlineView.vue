<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NLoadingState,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  BookText,
  PenLine,
  Save,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import ChapterOutlineEditor from '../features/outline/components/ChapterOutlineEditor.vue'
import OutlineAIPanel from '../features/outline/components/OutlineAIPanel.vue'
import VolumeChapterTree from '../features/outline/components/VolumeChapterTree.vue'
import { useOutlineWorkspace } from '../features/outline/composables/useOutlineWorkspace'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string

const {
  loading,
  saving,
  selectedChapterId,
  expandedVolumes,
  outlineForm,
  chapterElementDrafts,
  newEventName,
  isBrainstorming,
  aiSuggestion,
  outlineAlternatives,
  projectStore,
  characterStore,
  volumeStore,
  chapterStore,
  selectChapter,
  handleSave,
  handleAddChapter,
  handleAddVolume,
  toggleVolume,
  toggleCharacter,
  addCharacterElement,
  removeElement,
  addEventElement,
  handleAIBrainstorm,
  confirmOutlineAIResult,
  applyOutlineAlternative,
  removeOutlineAlternative,
} = useOutlineWorkspace(projectId)
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || '加载中...'" :project-id="projectId">
    <template #topbar-left>
      <div class="flex items-center gap-4">
        <router-link
          to="/"
          class="flex items-center gap-2 text-text-muted transition-colors hover:text-primary"
          title="返回书库"
        >
          <ArrowLeft :size="20" />
        </router-link>
        <div class="h-6 w-px bg-border-light" />
        <router-link
          :to="`/project/${projectId}`"
          class="text-base text-text-primary font-semibold transition-colors hover:text-primary"
        >
          {{ projectStore.currentProject?.title || '加载中...' }}
        </router-link>
      </div>
    </template>
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <template #topbar-right>
      <div v-if="selectedChapterId" class="flex gap-2">
        <NButton variant="ghost" size="sm" @click="router.push(`/project/${projectId}/write?chapter=${selectedChapterId}`)">
          <PenLine :size="16" class="mr-1.5" /> 开始写作
        </NButton>
        <NButton variant="primary" size="sm" :loading="saving" @click="handleSave">
          <Save :size="16" class="mr-1.5" /> 保存大纲
        </NButton>
      </div>
    </template>

    <div class="h-full flex overflow-hidden bg-bg-page">
      <VolumeChapterTree
        :volumes="volumeStore.volumes"
        :chapters="chapterStore.chapters"
        :expanded-volumes="expandedVolumes"
        :selected-chapter-id="selectedChapterId"
        @select="selectChapter"
        @toggle-volume="toggleVolume"
        @add-chapter="handleAddChapter"
        @add-volume="handleAddVolume"
      />

      <main class="flex-1 overflow-y-auto bg-bg-page p-8 lg:p-12">
        <div v-if="loading" class="h-64 flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else-if="!selectedChapterId" class="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
          <BookText :size="64" stroke-width="1" class="mb-4" />
          <p>选择一个章节以规划其大纲</p>
        </div>

        <ChapterOutlineEditor
          v-else
          v-model="outlineForm"
          :characters="characterStore.characters"
          :saving="saving"
          :is-brainstorming="isBrainstorming"
          :chapter-element-drafts="chapterElementDrafts"
          :new-event-name="newEventName"
          @save="handleSave"
          @toggle-character="toggleCharacter"
          @brainstorm="handleAIBrainstorm"
          @add-character-element="addCharacterElement"
          @remove-element="removeElement"
          @add-event-element="addEventElement"
          @update:new-event-name="newEventName = $event"
        />
      </main>

      <OutlineAIPanel
        :ai-suggestion="aiSuggestion"
        :is-brainstorming="isBrainstorming"
        :theme="projectStore.currentProject?.theme"
        :alternatives="outlineAlternatives"
        @brainstorm="handleAIBrainstorm"
        @confirm="confirmOutlineAIResult"
        @apply-alternative="applyOutlineAlternative"
        @remove-alternative="removeOutlineAlternative"
      />
    </div>
  </NAppLayout>
</template>
