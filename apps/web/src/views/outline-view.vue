<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NLoadingState,
} from '@ai-novel/ui'
import {
  BookText,
  PenLine,
  Save,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb.vue'
import AppSidebar from '../components/AppSidebar.vue'
import ChapterOutlineEditor from '../features/outline/components/ChapterOutlineEditor.vue'
import OutlineAIPanel from '../features/outline/components/OutlineAIPanel.vue'
import ProjectOutlineEditor from '../features/outline/components/ProjectOutlineEditor.vue'
import ScenePlanner from '../features/outline/components/ScenePlanner.vue'
import VolumeChapterTree from '../features/outline/components/VolumeChapterTree.vue'
import VolumeOutlineEditor from '../features/outline/components/VolumeOutlineEditor.vue'
import { useOutlineWorkspace } from '../features/outline/composables/useOutlineWorkspace'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string

const {
  loading,
  saving,
  selectedType,
  selectedId,
  expandedVolumes,
  outlineForm,
  projectForm,
  volumeForm,
  chapterElementDrafts,
  newEventName,
  isBrainstorming,
  aiSuggestion,
  sceneSuggestion,
  outlineAlternatives,
  projectStore,
  characterStore,
  volumeStore,
  chapterStore,
  selectProject,
  selectVolume,
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
  sceneStore,
  addScene,
  updateSceneData,
  deleteScene,
  reorderScenes,
  generateScenesAI,
  applySceneSuggestion,
  discardSceneSuggestion,
} = useOutlineWorkspace(projectId)
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || '加载中...'" :project-id="projectId">
    <template #topbar-left>
      <ProjectBreadcrumb
        :title="projectStore.currentProject?.title"
        title-fallback="加载中…"
        :title-to="`/project/${projectId}`"
        back-to="/"
      />
    </template>
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <template #topbar-right>
      <div v-if="selectedId" class="flex gap-2">
        <NButton v-if="selectedType === 'chapter'" variant="ghost" size="sm" @click="router.push(`/project/${projectId}/write?chapter=${selectedId}`)">
          <PenLine :size="16" class="mr-1.5" /> 开始写作
        </NButton>
        <NButton variant="primary" size="sm" :loading="saving" @click="handleSave">
          <Save :size="16" class="mr-1.5" /> {{ selectedType === 'project' ? '保存全书大纲' : selectedType === 'volume' ? '保存分卷大纲' : '保存章节大纲' }}
        </NButton>
      </div>
    </template>

    <div class="h-full flex overflow-hidden bg-bg-page">
      <VolumeChapterTree
        :volumes="volumeStore.volumes"
        :chapters="chapterStore.chapters"
        :expanded-volumes="expandedVolumes"
        :selected-type="selectedType"
        :selected-id="selectedId"
        @select-project="selectProject"
        @select-volume="selectVolume"
        @select="selectChapter"
        @toggle-volume="toggleVolume"
        @add-chapter="handleAddChapter"
        @add-volume="handleAddVolume"
      />

      <main class="flex-1 overflow-y-auto bg-bg-page p-8 lg:p-12">
        <div v-if="loading" class="h-64 flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else-if="!selectedId" class="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
          <BookText :size="64" stroke-width="1" class="mb-4" />
          <p>选择一个分卷或章节以规划其大纲</p>
        </div>

        <template v-else>
          <ProjectOutlineEditor
            v-if="selectedType === 'project'"
            v-model="projectForm"
          />

          <VolumeOutlineEditor
            v-else-if="selectedType === 'volume'"
            v-model="volumeForm"
          />

          <template v-else-if="selectedType === 'chapter'">
            <ChapterOutlineEditor
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

            <ScenePlanner
              :scenes="sceneStore.scenes"
              :is-generating="isBrainstorming"
              :scene-suggestion="sceneSuggestion"
              @add="addScene"
              @edit="updateSceneData"
              @delete="deleteScene"
              @reorder="reorderScenes"
              @generate="generateScenesAI"
              @apply-suggestion="applySceneSuggestion"
              @discard-suggestion="discardSceneSuggestion"
            />
          </template>
        </template>
      </main>

      <OutlineAIPanel
        :ai-suggestion="aiSuggestion"
        :is-brainstorming="isBrainstorming"
        :selected-type="selectedType"
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
