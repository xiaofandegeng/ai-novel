<script setup lang="ts">
import type { CharacterRole, NovelProject } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NConfirmDialog,
  NEmptyState,
  NInput,
  NLoadingState,
  NModal,
  NPanel,
  NTag,
  useToast,
} from '@ai-novel/ui'
import { onMounted, ref } from 'vue'
import { useChapterStore, useCharacterStore, useProjectStore, useStoryBibleStore, useVolumeStore } from '../stores/projects'

const toast = useToast()
const projectStore = useProjectStore()
const storyBibleStore = useStoryBibleStore()
const characterStore = useCharacterStore()
const volumeStore = useVolumeStore()
const chapterStore = useChapterStore()

const loading = ref(true)
const selectedProjectId = ref<string | null>(null)
const showCreateModal = ref(false)
const showEditProjectModal = ref(false)
const createError = ref('')

const formTitle = ref('')
const formGenre = ref('')
const formTheme = ref('')
const formTargetWords = ref('')

const statusVariantMap: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'> = {
  planning: 'info',
  writing: 'primary',
  paused: 'warning',
  completed: 'success',
  archived: 'default',
}

const chapterStatusVariantMap: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'info'> = {
  not_started: 'default',
  planning: 'info',
  writing: 'primary',
  completed: 'success',
}

onMounted(async () => {
  try {
    await projectStore.fetchProjects()
  }
  finally {
    loading.value = false
  }
})

async function selectProject(id: string) {
  selectedProjectId.value = id
  await Promise.all([
    projectStore.fetchProject(id),
    storyBibleStore.fetchStoryBible(id),
    characterStore.fetchCharacters(id),
    volumeStore.fetchVolumes(id),
    chapterStore.fetchChapters(id),
  ])
}

function deselectProject() {
  selectedProjectId.value = null
  projectStore.currentProject = null
  storyBibleStore.storyBible = null
  characterStore.characters = []
  volumeStore.volumes = []
  chapterStore.chapters = []
}

function openCreateModal() {
  formTitle.value = ''
  formGenre.value = ''
  formTheme.value = ''
  formTargetWords.value = ''
  createError.value = ''
  showCreateModal.value = true
}

function openEditProjectModal() {
  const p = projectStore.currentProject
  if (!p)
    return
  formTitle.value = p.title
  formGenre.value = p.genre || ''
  formTheme.value = p.theme || ''
  formTargetWords.value = p.targetWords?.toString() || ''
  createError.value = ''
  showEditProjectModal.value = true
}

async function handleCreate() {
  if (!formTitle.value.trim()) {
    createError.value = 'Title is required'
    return
  }
  try {
    const data: Partial<NovelProject> = {
      title: formTitle.value.trim(),
      genre: formGenre.value.trim() || undefined,
      theme: formTheme.value.trim() || undefined,
      targetWords: formTargetWords.value ? Number(formTargetWords.value) : undefined,
    }
    await projectStore.createProject(data)
    showCreateModal.value = false
    toast.add('Project created', 'success')
  }
  catch (e: any) {
    createError.value = e.message || 'Failed to create project'
    toast.add('Failed to create project', 'error')
  }
}

async function handleUpdateProject() {
  if (!selectedProjectId.value || !formTitle.value.trim())
    return
  try {
    const data: Partial<NovelProject> = {
      title: formTitle.value.trim(),
      genre: formGenre.value.trim() || undefined,
      theme: formTheme.value.trim() || undefined,
      targetWords: formTargetWords.value ? Number(formTargetWords.value) : undefined,
    }
    await projectStore.updateProject(selectedProjectId.value, data)
    showEditProjectModal.value = false
    toast.add('Project updated', 'success')
  }
  catch (e: any) {
    createError.value = e.message || 'Failed to update project'
    toast.add('Failed to update project', 'error')
  }
}

const showDeleteConfirm = ref(false)
const pendingDelete = ref<{
  type: 'project' | 'character' | 'volume' | 'chapter'
  id: string
  title: string
  description: string
} | null>(null)

function confirmDelete(id: string) {
  pendingDelete.value = {
    type: 'project',
    id,
    title: 'Delete Project',
    description: 'Are you sure you want to delete this project? This will permanently remove all characters, story bible entries, volumes, and chapters. This action cannot be undone.',
  }
  showDeleteConfirm.value = true
}

async function handleConfirmDelete() {
  if (!pendingDelete.value || (!selectedProjectId.value && pendingDelete.value.type !== 'project'))
    return

  const { type, id } = pendingDelete.value
  try {
    if (type === 'project') {
      await projectStore.deleteProject(id)
      if (selectedProjectId.value === id)
        deselectProject()
      toast.add('Project deleted', 'success')
    }
    else if (type === 'character') {
      await characterStore.deleteCharacter(selectedProjectId.value!, id)
      toast.add('Character deleted', 'success')
    }
    else if (type === 'volume') {
      await volumeStore.deleteVolume(selectedProjectId.value!, id)
      toast.add('Volume deleted', 'success')
      await chapterStore.fetchChapters(selectedProjectId.value!)
    }
    else if (type === 'chapter') {
      await chapterStore.deleteChapter(selectedProjectId.value!, id)
      toast.add('Chapter deleted', 'success')
    }
  }
  catch {
    toast.add(`Failed to delete ${type}`, 'error')
  }
  finally {
    showDeleteConfirm.value = false
    pendingDelete.value = null
  }
}

const showCharacterModal = ref(false)
const editingCharacterId = ref<string | null>(null)
interface CharForm {
  name: string
  role: CharacterRole | ''
  goal: string
  personality: string
}

const charForm = ref<CharForm>({
  name: '',
  role: '',
  goal: '',
  personality: '',
})

function openCreateCharacterModal() {
  editingCharacterId.value = null
  charForm.value = { name: '', role: '', goal: '', personality: '' }
  showCharacterModal.value = true
}

function openEditCharacterModal(char: any) {
  editingCharacterId.value = char.id
  charForm.value = {
    name: char.name,
    role: char.role || '',
    goal: char.goal || '',
    personality: char.personality || '',
  }
  showCharacterModal.value = true
}

async function handleSaveCharacter() {
  if (!selectedProjectId.value || !charForm.value.name.trim())
    return
  try {
    const data = {
      ...charForm.value,
      role: (charForm.value.role || undefined) as CharacterRole | undefined,
    }
    if (editingCharacterId.value) {
      await characterStore.updateCharacter(selectedProjectId.value, editingCharacterId.value, data)
      toast.add('Character updated', 'success')
    }
    else {
      await characterStore.createCharacter(selectedProjectId.value, data)
      toast.add('Character created', 'success')
    }
    showCharacterModal.value = false
  }
  catch {
    toast.add('Failed to save character', 'error')
  }
}

function handleDeleteCharacter(id: string) {
  pendingDelete.value = {
    type: 'character',
    id,
    title: 'Delete Character',
    description: 'Are you sure you want to delete this character? This action cannot be undone.',
  }
  showDeleteConfirm.value = true
}

const showVolumeModal = ref(false)
const volForm = ref({ title: '', summary: '', orderIndex: '1' })

function openCreateVolumeModal() {
  volForm.value = { title: '', summary: '', orderIndex: (volumeStore.volumes.length + 1).toString() }
  showVolumeModal.value = true
}

async function handleCreateVolume() {
  if (!selectedProjectId.value || !volForm.value.title.trim())
    return
  try {
    const data = {
      ...volForm.value,
      orderIndex: Number(volForm.value.orderIndex),
    }
    await volumeStore.createVolume(selectedProjectId.value, data)
    showVolumeModal.value = false
    toast.add('Volume created', 'success')
  }
  catch { toast.add('Failed to create volume', 'error') }
}

function handleDeleteVolume(id: string) {
  pendingDelete.value = {
    type: 'volume',
    id,
    title: 'Delete Volume',
    description: 'Are you sure you want to delete this volume and all its chapters? This action cannot be undone.',
  }
  showDeleteConfirm.value = true
}

const showChapterModal = ref(false)
const chForm = ref({ title: '', chapterNumber: '1', volumeId: '' })

function openCreateChapterModal() {
  chForm.value = {
    title: '',
    chapterNumber: (chapterStore.chapters.length + 1).toString(),
    volumeId: volumeStore.volumes[0]?.id || '',
  }
  showChapterModal.value = true
}

async function handleCreateChapter() {
  if (!selectedProjectId.value || !chForm.value.title.trim())
    return
  try {
    const data = {
      ...chForm.value,
      chapterNumber: Number(chForm.value.chapterNumber),
    }
    await chapterStore.createChapter(selectedProjectId.value, data)
    showChapterModal.value = false
    toast.add('Chapter created', 'success')
  }
  catch { toast.add('Failed to create chapter', 'error') }
}

function handleDeleteChapter(id: string) {
  pendingDelete.value = {
    type: 'chapter',
    id,
    title: 'Delete Chapter',
    description: 'Are you sure you want to delete this chapter? This action cannot be undone.',
  }
  showDeleteConfirm.value = true
}

const showBibleModal = ref(false)
const bibleForm = ref({ worldview: '', mainConflict: '', theme: '', rules: '', timeline: '' })

function openEditBibleModal() {
  const b = storyBibleStore.storyBible
  bibleForm.value = {
    worldview: b?.worldview || '',
    mainConflict: b?.mainConflict || '',
    theme: b?.theme || '',
    rules: b?.rules || '',
    timeline: b?.timeline || '',
  }
  showBibleModal.value = true
}

async function handleSaveBible() {
  if (!selectedProjectId.value)
    return
  try {
    if (storyBibleStore.storyBible) {
      await storyBibleStore.updateStoryBible(selectedProjectId.value, bibleForm.value)
      toast.add('Story bible updated', 'success')
    }
    else {
      await storyBibleStore.createStoryBible(selectedProjectId.value, bibleForm.value)
      toast.add('Story bible created', 'success')
    }
    showBibleModal.value = false
  }
  catch { toast.add('Failed to save story bible', 'error') }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString()
}

function getVolumesForChapter(volumeId?: string) {
  if (!volumeId)
    return 'Uncategorized'
  const vol = volumeStore.volumes.find((v: any) => v.id === volumeId)
  return vol ? vol.title : 'Uncategorized'
}
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || 'Project Workbench'">
    <template #nav>
      <div class="h-full flex flex-col">
        <div class="flex items-center justify-between border-b border-border-light p-4">
          <h2 class="text-base text-text-primary font-semibold">
            Projects
          </h2>
          <NButton size="sm" @click="openCreateModal">
            + New
          </NButton>
        </div>

        <NLoadingState v-if="loading" variant="text" :rows="6" />

        <NEmptyState
          v-else-if="projectStore.projects.length === 0"
          title="No projects yet"
          description="Create your first novel project to get started"
        >
          <template #action>
            <NButton size="sm" @click="openCreateModal">
              Create Project
            </NButton>
          </template>
        </NEmptyState>

        <div v-else class="flex-1 overflow-y-auto">
          <button
            v-for="project in projectStore.projects"
            :key="project.id"
            class="w-full border-b border-border-light p-3 text-left transition-colors hover:bg-bg-subtle"
            :class="{ 'bg-primary/5 border-l-2 border-l-primary': selectedProjectId === project.id }"
            @click="selectProject(project.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm text-text-primary font-medium">
                  {{ project.title }}
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <span v-if="project.genre" class="text-xs text-text-muted">
                    {{ project.genre }}
                  </span>
                  <NTag size="sm" :variant="statusVariantMap[project.status] || 'default'">
                    {{ project.status }}
                  </NTag>
                </div>
              </div>
              <button
                class="mt-0.5 h-6 w-6 inline-flex shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-semantic-error/10 hover:text-semantic-error"
                title="Delete project"
                @click.stop="confirmDelete(project.id)"
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </button>
        </div>
      </div>
    </template>

    <template #default>
      <div v-if="!selectedProjectId" class="h-full flex items-center justify-center">
        <NEmptyState
          title="Select a project"
          description="Choose a project from the sidebar to view its details"
        />
      </div>

      <div v-else class="p-6 space-y-6">
        <!-- Project Header -->
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-xl text-text-primary font-bold">
              {{ projectStore.currentProject?.title }}
            </h1>
            <div class="mt-2 flex items-center gap-3">
              <NTag v-if="projectStore.currentProject?.genre" variant="info">
                {{ projectStore.currentProject.genre }}
              </NTag>
              <NTag v-if="projectStore.currentProject?.status" :variant="statusVariantMap[projectStore.currentProject.status] || 'default'">
                {{ projectStore.currentProject.status }}
              </NTag>
              <span v-if="projectStore.currentProject?.targetWords" class="text-sm text-text-muted">
                Target: {{ projectStore.currentProject.targetWords.toLocaleString() }} words
              </span>
            </div>
            <p v-if="projectStore.currentProject?.theme" class="mt-1 text-sm text-text-muted">
              Theme: {{ projectStore.currentProject.theme }}
            </p>
          </div>
          <div class="flex gap-2">
            <NButton variant="ghost" size="sm" @click="openEditProjectModal">
              Edit Project
            </NButton>
            <NButton variant="secondary" size="sm" @click="deselectProject">
              Back
            </NButton>
          </div>
        </div>

        <!-- Story Bible -->
        <NPanel title="Story Bible" description="World-building and narrative rules">
          <template #actions>
            <NButton size="sm" variant="ghost" @click="openEditBibleModal">
              {{ storyBibleStore.storyBible ? 'Edit' : 'Create' }} Bible
            </NButton>
          </template>
          <template v-if="storyBibleStore.storyBible">
            <div class="space-y-3">
              <div v-if="storyBibleStore.storyBible.worldview">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  Worldview
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.worldview }}
                </p>
              </div>
              <div v-if="storyBibleStore.storyBible.mainConflict">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  Main Conflict
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.mainConflict }}
                </p>
              </div>
              <div v-if="storyBibleStore.storyBible.theme">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  Theme
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.theme }}
                </p>
              </div>
              <div v-if="storyBibleStore.storyBible.rules">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  Rules
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.rules }}
                </p>
              </div>
              <div v-if="storyBibleStore.storyBible.timeline">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  Timeline
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.timeline }}
                </p>
              </div>
            </div>
          </template>
          <template v-else>
            <p class="text-sm text-text-muted">
              No story bible created yet.
            </p>
          </template>
        </NPanel>

        <!-- Characters -->
        <NPanel title="Characters" :description="`Cast of ${characterStore.characters.length} character(s)`">
          <template #actions>
            <NButton size="sm" @click="openCreateCharacterModal">
              + Add Character
            </NButton>
          </template>
          <div v-if="characterStore.characters.length === 0" class="text-sm text-text-muted">
            No characters defined yet.
          </div>
          <div v-else class="grid gap-3 sm:grid-cols-2">
            <div
              v-for="char in characterStore.characters"
              :key="char.id"
              class="border border-border-light rounded-md p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-text-primary font-medium">{{ char.name }}</span>
                  <NTag v-if="char.role" size="sm" variant="ai">
                    {{ char.role }}
                  </NTag>
                </div>
                <div class="flex gap-1">
                  <button class="text-text-muted hover:text-primary" @click="openEditCharacterModal(char)">
                    <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                  </button>
                  <button class="text-text-muted hover:text-semantic-error" @click="handleDeleteCharacter(char.id)">
                    <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>
              <p v-if="char.goal" class="mt-1 text-xs text-text-muted">
                Goal: {{ char.goal }}
              </p>
              <p v-if="char.personality" class="mt-1 text-xs text-text-muted">
                Personality: {{ char.personality }}
              </p>
            </div>
          </div>
        </NPanel>

        <!-- Volumes -->
        <NPanel title="Volumes" :description="`${volumeStore.volumes.length} volume(s)`">
          <template #actions>
            <NButton size="sm" @click="openCreateVolumeModal">
              + Add Volume
            </NButton>
          </template>
          <div v-if="volumeStore.volumes.length === 0" class="text-sm text-text-muted">
            No volumes defined yet.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="vol in volumeStore.volumes"
              :key="vol.id"
              class="border border-border-light rounded-md p-3"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-text-muted font-mono">#{{ vol.orderIndex }}</span>
                  <span class="text-sm text-text-primary font-medium">{{ vol.title }}</span>
                </div>
                <button
                  class="h-6 w-6 inline-flex items-center justify-center rounded text-text-muted transition-colors hover:bg-semantic-error/10 hover:text-semantic-error"
                  title="Delete volume"
                  @click.stop="handleDeleteVolume(vol.id)"
                >
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
              <p v-if="vol.summary" class="mt-1 text-xs text-text-muted">
                {{ vol.summary }}
              </p>
            </div>
          </div>
        </NPanel>

        <!-- Chapters -->
        <NPanel title="Chapters" :description="`${chapterStore.chapters.length} chapter(s)`">
          <template #actions>
            <NButton size="sm" @click="openCreateChapterModal">
              + Add Chapter
            </NButton>
          </template>
          <div v-if="chapterStore.chapters.length === 0" class="text-sm text-text-muted">
            No chapters defined yet.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="ch in chapterStore.chapters"
              :key="ch.id"
              class="flex items-center justify-between border border-border-light rounded-md p-3"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-text-muted font-mono">Ch.{{ ch.chapterNumber }}</span>
                  <span class="truncate text-sm text-text-primary font-medium">{{ ch.title }}</span>
                </div>
                <div class="mt-1 flex items-center gap-2 text-xs text-text-muted">
                  <span>{{ getVolumesForChapter(ch.volumeId) }}</span>
                  <span v-if="ch.outline">Has outline</span>
                  <span v-if="ch.draft">{{ ch.draft.length }} chars draft</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <NTag size="sm" :variant="chapterStatusVariantMap[ch.status] || 'default'">
                  {{ ch.status }}
                </NTag>
                <button class="text-text-muted hover:text-semantic-error" @click.stop="handleDeleteChapter(ch.id)">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
            </div>
          </div>
        </NPanel>

        <!-- Metadata -->
        <div class="flex items-center gap-4 text-xs text-text-muted">
          <span>Created: {{ projectStore.currentProject ? formatDate(projectStore.currentProject.createdAt) : '' }}</span>
          <span>Updated: {{ projectStore.currentProject ? formatDate(projectStore.currentProject.updatedAt) : '' }}</span>
        </div>
      </div>

      <!-- Create Project Modal -->
      <NModal v-model="showCreateModal" title="Create New Project">
        <form class="space-y-4" @submit.prevent="handleCreate">
          <NInput
            v-model="formTitle"
            label="Title"
            placeholder="Enter project title"
            :error="createError && !formTitle.trim() ? 'Title is required' : ''"
          />
          <NInput
            v-model="formGenre"
            label="Genre"
            placeholder="e.g. Fantasy, Sci-Fi, Romance"
          />
          <NInput
            v-model="formTheme"
            label="Theme"
            placeholder="e.g. Redemption, Coming of age"
          />
          <NInput
            v-model="formTargetWords"
            label="Target Word Count"
            placeholder="e.g. 80000"
            type="number"
          />
          <p v-if="createError && formTitle.trim()" class="text-xs text-semantic-error">
            {{ createError }}
          </p>
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showCreateModal = false">
              Cancel
            </NButton>
            <NButton variant="primary" @click="handleCreate">
              Create Project
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Edit Project Modal -->
      <NModal v-model="showEditProjectModal" title="Edit Project">
        <form class="space-y-4" @submit.prevent="handleUpdateProject">
          <NInput v-model="formTitle" label="Title" placeholder="Project title" />
          <NInput v-model="formGenre" label="Genre" placeholder="Genre" />
          <NInput v-model="formTheme" label="Theme" placeholder="Theme" />
          <NInput v-model="formTargetWords" label="Target Word Count" type="number" />
          <p v-if="createError" class="text-xs text-semantic-error">
            {{ createError }}
          </p>
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showEditProjectModal = false">
              Cancel
            </NButton>
            <NButton variant="primary" @click="handleUpdateProject">
              Save Changes
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Character Modal -->
      <NModal v-model="showCharacterModal" :title="editingCharacterId ? 'Edit Character' : 'Create Character'">
        <form class="space-y-4" @submit.prevent="handleSaveCharacter">
          <NInput v-model="charForm.name" label="Name" placeholder="Character name" />
          <NInput v-model="charForm.role" label="Role" placeholder="Role (e.g. Protagonist)" />
          <NInput v-model="charForm.goal" label="Goal" placeholder="Character's primary goal" />
          <NTextArea v-model="charForm.personality" label="Personality" placeholder="Describe their personality" />
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showCharacterModal = false">
              Cancel
            </NButton>
            <NButton variant="primary" @click="handleSaveCharacter">
              {{ editingCharacterId ? 'Save' : 'Create' }}
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Volume Modal -->
      <NModal v-model="showVolumeModal" title="Create Volume">
        <form class="space-y-4" @submit.prevent="handleCreateVolume">
          <NInput v-model="volForm.title" label="Title" placeholder="Volume title" />
          <NTextArea v-model="volForm.summary" label="Summary" placeholder="Short summary" />
          <NInput v-model="volForm.orderIndex" label="Order Index" type="number" />
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showVolumeModal = false">
              Cancel
            </NButton>
            <NButton variant="primary" @click="handleCreateVolume">
              Create
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Chapter Modal -->
      <NModal v-model="showChapterModal" title="Create Chapter">
        <form class="space-y-4" @submit.prevent="handleCreateChapter">
          <NInput v-model="chForm.title" label="Title" placeholder="Chapter title" />
          <NInput v-model="chForm.chapterNumber" label="Chapter Number" type="number" />
          <NSelect
            v-model="chForm.volumeId"
            label="Volume"
            :options="volumeStore.volumes.map((v: any) => ({ label: v.title, value: v.id }))"
            placeholder="Select Volume"
          />
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showChapterModal = false">
              Cancel
            </NButton>
            <NButton variant="primary" @click="handleCreateChapter">
              Create
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Story Bible Modal -->
      <NModal v-model="showBibleModal" :title="storyBibleStore.storyBible ? 'Edit Story Bible' : 'Create Story Bible'">
        <form class="space-y-4" @submit.prevent="handleSaveBible">
          <NTextArea v-model="bibleForm.worldview" label="Worldview" placeholder="Describe the world" />
          <NTextArea v-model="bibleForm.mainConflict" label="Main Conflict" placeholder="What is the core conflict?" />
          <NTextArea v-model="bibleForm.theme" label="Theme" placeholder="Central theme" />
          <NTextArea v-model="bibleForm.rules" label="System Rules" placeholder="Magic systems, social rules, etc." />
          <NTextArea v-model="bibleForm.timeline" label="Timeline" placeholder="Key events" />
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showBibleModal = false">
              Cancel
            </NButton>
            <NButton variant="primary" @click="handleSaveBible">
              Save
            </NButton>
          </div>
        </template>
      </NModal>

      <NConfirmDialog
        v-model="showDeleteConfirm"
        :title="pendingDelete?.title || 'Delete'"
        :description="pendingDelete?.description || 'Are you sure?'"
        :confirm-text="pendingDelete?.title || 'Confirm'"
        variant="danger"
        @confirm="handleConfirmDelete"
      />
    </template>
  </NAppLayout>
</template>
