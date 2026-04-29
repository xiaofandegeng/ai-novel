<script setup lang="ts">
import type { Character, Conflict, KnowledgeSource, KnowledgeSourceDetail } from '@ai-novel/shared'
import type { KnowledgeEntry } from '../features/knowledge/components/KnowledgeSearchResults.vue'
import {
  NAppLayout,
  NInput,
  NLoadingState,
  NSelect,
  useToast,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  History,
  Layers,
  Search,
  Users,
  Zap,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import KnowledgeSearchResults from '../features/knowledge/components/KnowledgeSearchResults.vue'
import KnowledgeSourceDrawer from '../features/knowledge/components/KnowledgeSourceDrawer.vue'
import KnowledgeSourceList from '../features/knowledge/components/KnowledgeSourceList.vue'
import KnowledgeUploadPanel from '../features/knowledge/components/KnowledgeUploadPanel.vue'
import { useKnowledgeUpload } from '../features/knowledge/composables/useKnowledgeUpload'
import { useKnowledgeStore } from '../stores/knowledge.store'
import {
  useCharacterStore,
  useConflictStore,
  useProjectStore,
  useRelationshipStore,
  useStoryBibleStore,
} from '../stores/projects'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const characterStore = useCharacterStore()
const bibleStore = useStoryBibleStore()
const relationshipStore = useRelationshipStore()
const conflictStore = useConflictStore()
const knowledgeStore = useKnowledgeStore()

const { uploading, uploadFile, validateFile } = useKnowledgeUpload(projectId)

const loading = ref(true)
const activeTab = ref<'nodes' | 'library'>('nodes')
const selectedSource = ref<KnowledgeSourceDetail | null>(null)
const searchQuery = ref('')
const selectedType = ref<'all' | 'character' | 'setting' | 'conflict'>('all')

const typeOptions = [
  { label: '全部类别', value: 'all' },
  { label: '角色管理', value: 'character' },
  { label: '世界设定', value: 'setting' },
  { label: '冲突线索', value: 'conflict' },
]

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      characterStore.fetchCharacters(projectId),
      bibleStore.fetchStoryBible(projectId),
      relationshipStore.fetchRelationships(projectId),
      conflictStore.fetchConflicts(projectId),
      knowledgeStore.fetchSources(projectId),
    ])
  }
  catch {
    toast.add('Failed to aggregate knowledge base', 'error')
  }
  finally {
    loading.value = false
  }
})

// --- Upload handling ---

async function handleUpload(file: File) {
  const error = validateFile(file)
  if (error) {
    toast.add(error, 'error')
    return
  }
  try {
    await uploadFile(file)
    toast.add('Reference material uploaded and analyzed', 'success')
  }
  catch {
    toast.add('Upload failed', 'error')
  }
}

// --- Source detail ---

async function viewSource(source: KnowledgeSource) {
  selectedSource.value = await knowledgeStore.fetchSourceDetail(projectId, source.id)
}

// --- Aggregate knowledge entries ---

const allEntries = computed<KnowledgeEntry[]>(() => {
  const items: (KnowledgeEntry & { original?: Character | Conflict })[] = []

  if (bibleStore.storyBible) {
    const b = bibleStore.storyBible
    if (b.worldview)
      items.push({ id: 'worldview', title: 'Worldview', content: b.worldview, type: 'setting', icon: BookOpen })
    if (b.rules)
      items.push({ id: 'rules', title: 'Deep Rules', content: b.rules, type: 'setting', icon: Layers })
    if (b.theme)
      items.push({ id: 'themes', title: 'Core Themes', content: b.theme, type: 'setting', icon: History })
  }

  characterStore.characters.forEach((c) => {
    items.push({
      id: c.id,
      title: c.name,
      content: `${c.role}. ${c.personality || ''} ${c.goal || ''}`,
      type: 'character',
      icon: Users,
      original: c,
    })
  })

  conflictStore.conflicts.forEach((c) => {
    items.push({
      id: c.id,
      title: c.title,
      content: c.description || '',
      type: 'conflict',
      icon: Zap,
      original: c,
    })
  })

  return items
})

const filteredEntries = computed(() => {
  let result = allEntries.value

  if (selectedType.value !== 'all') {
    result = result.filter(e => e.type === selectedType.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(e =>
      e.title.toLowerCase().includes(q)
      || e.content.toLowerCase().includes(q),
    )
  }

  return result
})

function navigateTo(entry: KnowledgeEntry) {
  const map: Record<string, string> = {
    character: `/project/${projectId}/characters`,
    setting: `/project/${projectId}/bible`,
    conflict: `/project/${projectId}/conflicts`,
  }
  router.push(map[entry.type])
}
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || 'Loading...'"
    :project-id="projectId"
  >
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
          {{ projectStore.currentProject?.title || 'Loading...' }}
        </router-link>
      </div>
    </template>
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <div class="h-full flex flex-col overflow-hidden bg-bg-page">
      <!-- Header -->
      <header class="sticky top-0 z-10 border-b border-border-light bg-bg-surface p-8 shadow-sm">
        <div class="mx-auto max-w-4xl space-y-6">
          <div class="flex items-center justify-between">
            <h1 class="flex items-center gap-3 text-2xl text-text-primary font-bold">
              <button class="h-8 w-8 p-0 -ml-2" @click="router.back()">
                <ChevronLeft :size="24" />
              </button>
              <Search :size="28" class="text-primary" /> 全局知识库
            </h1>
            <div class="flex rounded-xl bg-bg-page p-1">
              <button
                v-for="t in [{ id: 'nodes', label: '创作节点' }, { id: 'library', label: '参考书库' }]"
                :key="t.id"
                class="rounded-lg px-4 py-2 text-xs font-bold tracking-wider uppercase transition-all"
                :class="activeTab === t.id ? 'bg-bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'"
                @click="activeTab = t.id as 'nodes' | 'library'"
              >
                {{ t.label }}
              </button>
            </div>
          </div>

          <!-- Nodes tab: search + filter -->
          <div v-if="activeTab === 'nodes'" class="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div class="min-w-0 flex-1">
              <NInput
                v-model="searchQuery"
                label="知识搜索"
                placeholder="搜索角色、世界规则、冲突..."
              />
            </div>
            <NSelect
              v-model="selectedType"
              label="类别筛选"
              :options="typeOptions"
            />
          </div>

          <!-- Library tab: upload panel -->
          <KnowledgeUploadPanel v-else :uploading="uploading" @upload="handleUpload" />
        </div>
      </header>

      <!-- Content -->
      <main class="flex-1 overflow-y-auto p-8">
        <div v-if="loading" class="h-64 flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else class="mx-auto max-w-4xl">
          <template v-if="activeTab === 'nodes'">
            <KnowledgeSearchResults :entries="filteredEntries" @navigate="navigateTo" />
          </template>

          <template v-else>
            <KnowledgeSourceDrawer
              v-if="selectedSource"
              :source="selectedSource"
              @back="selectedSource = null"
            />
            <KnowledgeSourceList
              v-else
              :sources="knowledgeStore.sources"
              :uploading="uploading"
              @select="viewSource"
            />
          </template>
        </div>
      </main>

      <!-- Stats Footer -->
      <footer class="flex items-center justify-center gap-8 border-t border-border-light bg-bg-surface p-4 text-[10px] text-text-muted font-bold tracking-widest uppercase">
        <div class="flex items-center gap-1.5">
          <Users :size="12" /> {{ characterStore.characters.length }} 名角色
        </div>
        <div class="flex items-center gap-1.5">
          <BookOpen :size="12" /> 设定节点就绪
        </div>
        <div class="flex items-center gap-1.5">
          <Zap :size="12" /> {{ conflictStore.conflicts.length }} 处冲突
        </div>
      </footer>
    </div>
  </NAppLayout>
</template>
