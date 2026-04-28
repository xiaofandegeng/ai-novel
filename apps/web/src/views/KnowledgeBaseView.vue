<script setup lang="ts">
import {
  NAppLayout,
  NLoadingState,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  BookOpen,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Filter,
  History,
  Layers,
  Search,
  Users,
  Zap,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useApi } from '../composables/useApi'
import {
  useCharacterStore,
  useConflictStore,
  useProjectStore,
  useRelationshipStore,
  useStoryBibleStore,
} from '../stores/projects'

const route = useRoute()
const useRouterInstance = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const characterStore = useCharacterStore()
const bibleStore = useStoryBibleStore()
const relationshipStore = useRelationshipStore()
const conflictStore = useConflictStore()

const api = useApi()

const loading = ref(true)
const activeTab = ref<'nodes' | 'library'>('nodes')
const sources = ref<any[]>([])
const uploading = ref(false)
const selectedSource = ref<any>(null)
const searchQuery = ref('')
const selectedType = ref<'all' | 'character' | 'setting' | 'conflict'>('all')

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      characterStore.fetchCharacters(projectId),
      bibleStore.fetchStoryBible(projectId),
      relationshipStore.fetchRelationships(projectId),
      conflictStore.fetchConflicts(projectId),
      fetchSources(),
    ])
  }
  catch {
    toast.add('Failed to aggregate knowledge base', 'error')
  }
  finally {
    loading.value = false
  }
})

async function fetchSources() {
  const data = await api.get<any[]>(`/api/projects/${projectId}/knowledge/sources`)
  sources.value = data
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length)
    return

  const file = input.files[0]
  uploading.value = true

  try {
    // 1. Create source record
    const source = await api.post<any>(`/api/projects/${projectId}/knowledge/sources`, {
      title: file.name.replace(/\.[^/.]+$/, ''),
      fileName: file.name,
      fileSize: file.size,
      sourceType: 'classic',
    })

    // 2. Read file content
    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target?.result as string
      // 3. Trigger analysis (In real app, this would be backend task)
      await api.post(`/api/projects/${projectId}/knowledge/sources/${source.id}/analyze`, { content })
      toast.add('Reference material uploaded and analyzed', 'success')
      fetchSources()
    }
    reader.readAsText(file)
  }
  catch {
    toast.add('Upload failed', 'error')
  }
  finally {
    uploading.value = false
    input.value = ''
  }
}

async function viewSource(source: any) {
  const detail = await api.get<any>(`/api/projects/${projectId}/knowledge/sources/${source.id}`)
  selectedSource.value = detail
}

// Aggregate all knowledge entities
const allEntries = computed(() => {
  const items: any[] = []

  // Settings from Bible
  if (bibleStore.storyBible) {
    const b = bibleStore.storyBible
    if (b.worldview)
      items.push({ id: 'worldview', title: 'Worldview', content: b.worldview, type: 'setting', icon: BookOpen })
    if (b.rules)
      items.push({ id: 'rules', title: 'Deep Rules', content: b.rules, type: 'setting', icon: Layers })
    if (b.theme)
      items.push({ id: 'themes', title: 'Core Themes', content: b.theme, type: 'setting', icon: History })
  }

  // Characters
  characterStore.characters.forEach((c: any) => {
    items.push({
      id: c.id,
      title: c.name,
      content: `${c.role}. ${c.personality || ''} ${c.goal || ''}`,
      type: 'character',
      icon: Users,
      original: c,
    })
  })

  // Conflicts
  conflictStore.conflicts.forEach((c: any) => {
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
    result = result.filter((e: any) => e.type === selectedType.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter((e: any) =>
      e.title.toLowerCase().includes(q)
      || e.content.toLowerCase().includes(q),
    )
  }

  return result
})

function navigateTo(entry: any) {
  const map: any = {
    character: `/project/${projectId}/characters`,
    setting: `/project/${projectId}/bible`,
    conflict: `/project/${projectId}/conflicts`,
  }
  useRouterInstance.push(map[entry.type])
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
      <!-- Search Bar -->
      <header class="sticky top-0 z-10 border-b border-border-light bg-bg-surface p-8 shadow-sm">
        <div class="mx-auto max-w-4xl space-y-6">
          <div class="flex items-center justify-between">
            <h1 class="flex items-center gap-3 text-2xl text-text-primary font-bold">
              <NButton variant="ghost" size="sm" class="-ml-2 h-8 w-8 p-0" @click="useRouterInstance.back()">
                <ChevronLeft :size="24" />
              </NButton>
              <Search :size="28" class="text-primary" /> 全局知识库
            </h1>
            <div class="flex rounded-xl bg-bg-page p-1">
              <button
                v-for="t in [{ id: 'nodes', label: '创作节点' }, { id: 'library', label: '参考书库' }]"
                :key="t.id"
                class="rounded-lg px-4 py-2 text-xs font-bold tracking-wider uppercase transition-all"
                :class="activeTab === t.id ? 'bg-bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'"
                @click="activeTab = t.id as any"
              >
                {{ t.label }}
              </button>
            </div>
          </div>

          <div v-if="activeTab === 'nodes'" class="flex gap-4">
            <div class="relative flex-1">
              <Search class="absolute left-4 top-1/2 text-text-muted -translate-y-1/2" :size="18" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索角色、世界规则、冲突..."
                class="w-full border-2 border-border-light rounded-2xl bg-bg-subtle py-4 pl-12 pr-4 text-base shadow-inner transition-all focus:border-primary focus:bg-bg-surface focus:outline-none"
              >
            </div>
            <select
              v-model="selectedType"
              class="cursor-pointer border-2 border-border-light rounded-2xl bg-bg-surface px-6 py-4 text-sm text-text-primary font-bold transition-all focus:border-primary focus:ring-0"
            >
              <option value="all">
                全部类别
              </option>
              <option value="character">
                角色管理
              </option>
              <option value="setting">
                设定/设定集
              </option>
              <option value="conflict">
                冲突矩阵
              </option>
            </select>
          </div>

          <div v-else class="border-border-default flex items-center justify-between border rounded-2xl border-dashed bg-bg-page/50 p-4">
            <div class="flex items-center gap-4">
              <BookOpen class="text-primary" :size="32" />
              <div>
                <h3 class="text-sm text-text-primary font-bold">
                  研习经典
                </h3>
                <p class="text-xs text-text-muted">
                  上传并分析现有小说，提炼其写作技法。
                </p>
              </div>
            </div>
            <label class="flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm text-white font-bold shadow-lg transition-all hover:bg-primary/90">
              <span v-if="uploading" class="h-4 w-4 animate-spin border-2 border-white/30 border-t-white rounded-full" />
              <template v-else>
                <Layers :size="18" /> 上传素材 (.txt)
              </template>
              <input type="file" accept=".txt" class="hidden" :disabled="uploading" @change="handleFileUpload">
            </label>
          </div>
        </div>
      </header>

      <!-- Content Area -->
      <main class="flex-1 overflow-y-auto p-8">
        <div v-if="loading" class="h-64 flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else class="mx-auto max-w-4xl">
          <template v-if="activeTab === 'nodes'">
            <div v-if="filteredEntries.length === 0" class="py-20 text-center opacity-30">
              <Filter :size="64" class="mx-auto mb-4" />
              <p class="text-lg">
                在创作节点中未找到匹配项。
              </p>
            </div>

            <div class="grid gap-4">
              <div
                v-for="entry in filteredEntries"
                :key="entry.id"
                class="group animate-in flex cursor-pointer items-start gap-6 border border-border-light rounded-2xl bg-bg-surface p-6 transition-all hover:border-primary/30 hover:shadow-md"
                @click="navigateTo(entry)"
              >
                <div class="h-12 w-12 flex items-center justify-center rounded-xl bg-bg-subtle text-text-secondary transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <component :is="entry.icon" :size="24" />
                </div>
                <div class="flex-1 space-y-1">
                  <div class="flex items-center gap-3">
                    <h3 class="text-lg text-text-primary font-bold transition-colors group-hover:text-primary">
                      {{ entry.title }}
                    </h3>
                    <NTag size="sm" :variant="entry.type === 'character' ? 'primary' : entry.type === 'conflict' ? 'error' : 'info'" class="text-[9px] font-bold uppercase">
                      {{ entry.type }}
                    </NTag>
                  </div>
                  <p class="line-clamp-2 text-sm text-text-secondary leading-relaxed">
                    {{ entry.content }}
                  </p>
                </div>
                <ChevronRight :size="20" class="mt-4 text-text-muted transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </template>

          <template v-else>
            <!-- Library View -->
            <div v-if="selectedSource" class="animate-in space-y-8">
              <button class="mb-4 flex items-center gap-2 text-sm text-primary font-bold" @click="selectedSource = null">
                <ChevronRight class="rotate-180" :size="16" /> 返回书库
              </button>

              <div class="border border-border-light rounded-3xl bg-bg-surface p-8 shadow-sm space-y-6">
                <div>
                  <h2 class="text-3xl text-text-primary font-bold">
                    {{ selectedSource.title }}
                  </h2>
                  <p class="text-text-muted">
                    作者：{{ selectedSource.author || '未知' }}
                  </p>
                </div>

                <div class="grid grid-cols-3 gap-4 border-y border-border-light py-6">
                  <div class="p-4 text-center">
                    <div class="text-2xl text-primary font-bold">
                      {{ selectedSource.chunks?.length || 0 }}
                    </div>
                    <div class="text-[10px] text-text-muted font-bold tracking-widest uppercase">
                      章节数
                    </div>
                  </div>
                  <div class="border-x border-border-light p-4 text-center">
                    <div class="text-2xl text-primary font-bold">
                      {{ selectedSource.status }}
                    </div>
                    <div class="text-[10px] text-text-muted font-bold tracking-widest uppercase">
                      分析状态
                    </div>
                  </div>
                  <div class="p-4 text-center">
                    <div class="text-2xl text-primary font-bold">
                      {{ Math.round((selectedSource.fileSize || 0) / 1024) }}KB
                    </div>
                    <div class="text-[10px] text-text-muted font-bold tracking-widest uppercase">
                      文件大小
                    </div>
                  </div>
                </div>

                <div class="space-y-4">
                  <h3 class="text-sm text-text-muted font-bold tracking-widest uppercase">
                    内容拆解
                  </h3>
                  <div class="space-y-4">
                    <div v-for="chunk in selectedSource.chunks" :key="chunk.id" class="border border-border-light rounded-xl p-4 transition-all hover:border-primary/20">
                      <div class="mb-2 flex items-center justify-between">
                        <span class="text-sm font-bold">{{ chunk.title }}</span>
                        <NTag size="sm" variant="info">
                          AI 已分析
                        </NTag>
                      </div>
                      <p class="mb-3 text-xs text-text-secondary leading-relaxed">
                        {{ chunk.summary }}
                      </p>
                      <div v-if="chunk.techniques" class="border border-primary/10 rounded-lg bg-primary/5 p-3">
                        <span class="mb-1 block text-[9px] text-primary font-bold uppercase">技法洞察</span>
                        <p class="text-[11px] text-text-primary italic">
                          {{ chunk.techniques }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="animate-in grid grid-cols-1 gap-6 lg:grid-cols-3 md:grid-cols-2">
              <div
                v-for="source in sources"
                :key="source.id"
                class="group cursor-pointer overflow-hidden border border-border-light rounded-2xl bg-bg-surface shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                @click="viewSource(source)"
              >
                <div class="relative h-32 flex items-center justify-center overflow-hidden border-b border-border-light bg-bg-subtle">
                  <BookOpen :size="48" class="text-text-muted transition-colors group-hover:text-primary/50" />
                  <div v-if="source.status === 'processing'" class="absolute inset-0 flex items-center justify-center bg-primary/10 backdrop-blur-[2px]">
                    <div class="h-6 w-6 animate-spin border-2 border-primary/30 border-t-primary rounded-full" />
                  </div>
                </div>
                <div class="p-4 space-y-1">
                  <h4 class="truncate text-text-primary font-bold">
                    {{ source.title }}
                  </h4>
                  <p class="text-[10px] text-text-muted font-bold tracking-widest uppercase">
                    {{ source.status }} · {{ Math.round((source.fileSize || 0) / 1024) }}KB
                  </p>
                </div>
              </div>

              <div v-if="sources.length === 0 && !uploading" class="col-span-full py-20 text-center opacity-30">
                <BookOpen :size="64" class="mx-auto mb-4" />
                <p>暂无参考素材。</p>
              </div>
            </div>
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

<style scoped>
.animate-in {
  animation: slide-in 0.4s ease-out both;
}
@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
