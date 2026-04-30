<script setup lang="ts">
import type { CharacterRole } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NConfirmDialog,
  NInput,
  NLoadingState,
  NSelect,
  NTextArea,
  useToast,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserCircle,
  UserPlus,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chatStream, readChatStream } from '../api/ai'
import AppSidebar from '../components/AppSidebar.vue'
import { useCharacterStore, useProjectStore } from '../stores/projects'
import { characterRoleOptions, getCharacterRoleLabel } from '../utils/character-labels'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const characterStore = useCharacterStore()

const loading = ref(true)
const saving = ref(false)
const searchQuery = ref('')
const selectedCharId = ref<string | null>(null)

interface CharForm {
  name: string
  role: CharacterRole | ''
  goal: string
  fear: string
  secret: string
  desire: string
  weakness: string
  personality: string
  arc: string
}

const charForm = ref<CharForm>({
  name: '',
  role: '',
  goal: '',
  fear: '',
  secret: '',
  desire: '',
  weakness: '',
  personality: '',
  arc: '',
})

// --- AI Section ---
const isAnalyzing = ref(false)
const aiSuggestion = ref<string | null>(null)

async function handleAIAnalyze() {
  if (!selectedCharId.value) {
    toast.add('请先选择一个角色', 'warning')
    return
  }

  isAnalyzing.value = true
  aiSuggestion.value = ''

  const prompt = `基于角色的基本信息（姓名：${charForm.value.name}，身份：${getCharacterRoleLabel(charForm.value.role)}），以及现有的性格描述："${charForm.value.personality || '无'}"，请深入分析该角色的行为动机，为其建议一些具有冲突性的恐惧、秘密与欲望。`

  try {
    const response = await chatStream(
      [{ role: 'user', content: prompt }],
      {
        projectId,
        context: `项目背景: ${projectStore.currentProject?.description || '未定义'}`,
        scene: 'chat',
      },
    )

    await readChatStream(response, (text) => {
      aiSuggestion.value = text
    })
  }
  catch (error: any) {
    aiSuggestion.value = `Error: ${error.message || 'AI 分析失败'}`
    toast.add(error.message || 'AI 分析失败', 'error')
  }
  finally {
    isAnalyzing.value = false
  }
}

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      characterStore.fetchCharacters(projectId),
    ])
    if (characterStore.characters.length > 0) {
      selectCharacter(characterStore.characters[0].id)
    }
  }
  catch {
    toast.add('加载角色数据失败，请稍后重试', 'error')
  }
  finally {
    loading.value = false
  }
})

const filteredCharacters = computed(() => {
  if (!searchQuery.value.trim())
    return characterStore.characters
  const q = searchQuery.value.toLowerCase()
  return characterStore.characters.filter(c =>
    c.name.toLowerCase().includes(q)
    || Boolean(c.role && c.role.toLowerCase().includes(q))
    || getCharacterRoleLabel(c.role).toLowerCase().includes(q),
  )
})

const charRoleModel = computed<string | number>({
  get: () => charForm.value.role,
  set: (value) => {
    charForm.value.role = String(value) as CharacterRole
  },
})

function selectCharacter(id: string) {
  selectedCharId.value = id
  const char = characterStore.characters.find(c => c.id === id)
  if (char) {
    charForm.value = {
      name: char.name,
      role: char.role || '',
      goal: char.goal || '',
      fear: char.fear || '',
      secret: char.secret || '',
      desire: char.desire || '',
      weakness: char.weakness || '',
      personality: char.personality || '',
      arc: char.arc || '',
    }
  }
}

async function handleAddCharacter() {
  try {
    const newChar = await characterStore.createCharacter(projectId, {
      name: '新角色',
      role: 'supporting',
    })
    toast.add('角色已添加', 'success')
    selectCharacter(newChar.id)
  }
  catch {
    toast.add('添加角色失败，请稍后重试', 'error')
  }
}

async function handleSave() {
  if (!selectedCharId.value)
    return
  saving.value = true
  try {
    const data = {
      ...charForm.value,
      role: (charForm.value.role || undefined) as CharacterRole | undefined,
    }
    await characterStore.updateCharacter(projectId, selectedCharId.value, data)
    toast.add('角色已更新', 'success')
  }
  catch {
    toast.add('保存失败，请稍后重试', 'error')
  }
  finally {
    saving.value = false
  }
}

const showDeleteConfirm = ref(false)

function confirmDelete() {
  if (!selectedCharId.value)
    return
  showDeleteConfirm.value = true
}

async function handleConfirmDelete() {
  if (!selectedCharId.value)
    return
  try {
    const idToDelete = selectedCharId.value
    await characterStore.deleteCharacter(projectId, idToDelete)
    toast.add('角色已删除', 'success')

    if (characterStore.characters.length > 0) {
      selectCharacter(characterStore.characters[0].id)
    }
    else {
      selectedCharId.value = null
    }
  }
  catch {
    toast.add('删除失败，请稍后重试', 'error')
  }
  finally {
    showDeleteConfirm.value = false
  }
}

const sections = [
  { id: 'profile', label: '侧写基础', icon: UserCircle },
  { id: 'inner', label: '内心世界', icon: Info },
  { id: 'arc', label: '成长弧光', icon: Sparkles },
]
const activeTab = ref('profile')
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中…'"
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
          {{ projectStore.currentProject?.title || '加载中…' }}
        </router-link>
      </div>
    </template>
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <template #topbar-right>
      <div v-if="selectedCharId" class="flex gap-2">
        <NButton variant="ghost" size="sm" class="text-semantic-error hover:bg-semantic-error/10" @click="confirmDelete">
          <Trash2 :size="16" />
        </NButton>
        <NButton variant="primary" size="sm" :loading="saving" @click="handleSave">
          <Save :size="16" class="mr-1.5" /> 保存角色资料
        </NButton>
      </div>
    </template>

    <div class="h-full flex overflow-hidden bg-bg-page">
      <!-- Left: Character List -->
      <aside class="w-72 flex shrink-0 flex-col border-r border-border-light bg-bg-surface">
        <div class="border-b border-border-light p-4 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
              <NButton variant="ghost" size="sm" class="h-8 w-8 p-0 -ml-2" @click="router.back()">
                <ChevronLeft :size="18" />
              </NButton>
              角色列表
            </h2>
            <NButton variant="ghost" size="sm" @click="handleAddCharacter">
              <UserPlus :size="16" />
            </NButton>
          </div>
          <div class="relative">
            <label class="sr-only" for="character-search">搜索角色</label>
            <Search class="absolute left-3 top-1/2 text-text-muted -translate-y-1/2" :size="14" />
            <input
              id="character-search"
              v-model="searchQuery"
              type="text"
              placeholder="搜索角色..."
              class="w-full border border-border-light rounded-md bg-bg-subtle py-1.5 pl-9 pr-3 text-xs transition-colors focus:border-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
          </div>
        </div>
        <nav class="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            v-for="char in filteredCharacters"
            :key="char.id"
            class="w-full flex items-center justify-between rounded-lg px-3 py-3 text-left text-sm transition-all"
            :class="selectedCharId === char.id
              ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
              : 'text-text-secondary hover:bg-bg-subtle'"
            @click="selectCharacter(char.id)"
          >
            <div class="flex flex-col">
              <span class="font-semibold" :class="selectedCharId === char.id ? 'text-primary' : 'text-text-primary'">
                {{ char.name }}
              </span>
              <span class="max-w-40 truncate text-xs text-text-muted">{{ getCharacterRoleLabel(char.role) }}</span>
            </div>
            <ChevronRight v-if="selectedCharId === char.id" :size="14" />
          </button>
        </nav>
      </aside>

      <!-- Center: Profile Editor -->
      <main class="flex-1 overflow-y-auto bg-bg-page p-8">
        <div v-if="loading" class="h-64 flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else-if="!selectedCharId" class="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
          <UserCircle :size="64" stroke-width="1" class="mb-4" />
          <p>选择或新建一个角色开始编辑</p>
          <NButton variant="ghost" size="sm" class="mt-4" @click="handleAddCharacter">
            + 新建角色
          </NButton>
        </div>

        <div v-else class="mx-auto max-w-3xl space-y-10">
          <!-- Main Info Header -->
          <section class="space-y-6">
            <div class="flex items-end gap-6">
              <div class="border-border-default h-24 w-24 flex items-center justify-center border-2 rounded-xl border-dashed bg-bg-subtle text-text-muted">
                <UserCircle :size="48" stroke-width="1" />
              </div>
              <div class="flex-1 space-y-4">
                <NInput v-model="charForm.name" label="角色姓名" placeholder="例：林语森" />
                <NSelect
                  v-model="charRoleModel"
                  label="身份定位"
                  :options="characterRoleOptions"
                  placeholder="选择角色身份"
                />
              </div>
            </div>
          </section>

          <!-- Navigation Tabs -->
          <div class="flex border-b border-border-light">
            <button
              v-for="tab in sections"
              :key="tab.id"
              class="relative px-6 py-3 text-sm font-medium transition-all"
              :class="activeTab === tab.id ? 'text-primary' : 'text-text-muted hover:text-text-primary'"
              @click="activeTab = tab.id"
            >
              <div class="flex items-center gap-2">
                <component :is="tab.icon" :size="16" />
                {{ tab.label }}
              </div>
              <div v-if="activeTab === tab.id" class="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
            </button>
          </div>

          <!-- Tab Content -->
          <div class="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
            <!-- Profile Tab -->
            <div v-if="activeTab === 'profile'" class="grid gap-6">
              <NTextArea v-model="charForm.personality" label="性格概括" placeholder="表面特征、生活习惯、口头禅..." :rows="4" />
              <NTextArea v-model="charForm.goal" label="当前目标" placeholder="他们现在最想要的是什么？" :rows="3" />
            </div>

            <!-- Inner World Tab -->
            <div v-if="activeTab === 'inner'" class="grid gap-6">
              <div class="grid gap-6 md:grid-cols-2">
                <NTextArea v-model="charForm.desire" label="核心欲望" placeholder="底层的原始冲动..." :rows="4" />
                <NTextArea v-model="charForm.fear" label="核心恐惧" placeholder="什么是他们深夜的梦魇？" :rows="4" />
              </div>
              <div class="grid gap-6 md:grid-cols-2">
                <NTextArea v-model="charForm.secret" label="灰暗秘密" placeholder="那些不愿为人知的往事..." :rows="4" />
                <NTextArea v-model="charForm.weakness" label="性格软肋" placeholder="可能导致其毁灭的性格缺陷..." :rows="4" />
              </div>
            </div>

            <!-- Growth Arc Tab -->
            <div v-if="activeTab === 'arc'" class="grid gap-6">
              <NTextArea
                v-model="charForm.arc"
                label="成长曲线（转变历程）"
                placeholder="角色从故事开始到结束发生了怎样的转变？"
                :rows="8"
              />
              <div class="flex gap-3 border border-accent/10 rounded-lg bg-accent-soft p-4">
                <Info :size="16" class="mt-0.5 shrink-0 text-accent" />
                <p class="text-xs text-text-secondary leading-relaxed">
                  一个精彩的角色弧光通常涉及角色克服**核心恐惧**或**性格软肋**以实现其**核心欲望**，或者在悲剧中因无法克服而毁灭。
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Right: AI Assistant -->
      <aside class="hidden w-80 shrink-0 flex-col border-l border-border-light bg-bg-surface xl:flex">
        <div class="border-b border-border-light bg-bg-page/50 p-4">
          <h2 class="flex items-center gap-2 text-sm text-ai font-bold tracking-wider uppercase">
            <Sparkles :size="16" /> 角色 AI 助手
          </h2>
        </div>
        <div class="overflow-y-auto p-6 space-y-6">
          <div class="border border-ai/10 rounded-xl bg-ai-soft p-4">
            <p class="mb-2 text-sm text-text-primary font-medium">
              生成行为动机
            </p>
            <p class="mb-4 text-xs text-text-secondary leading-relaxed">
              我可以基于该角色的身份定位，为其建议一系列冲突性的恐惧、秘密与欲望。
            </p>
            <NButton
              variant="ai"
              size="sm"
              class="w-full"
              :loading="isAnalyzing"
              :disabled="!selectedCharId"
              @click="handleAIAnalyze"
            >
              分析并充实角色
            </NButton>

            <div v-if="isAnalyzing || aiSuggestion !== null" class="animate-in fade-in slide-in-from-top-2 mt-4 border border-ai/20 rounded-lg bg-white p-3 shadow-sm space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-[10px] text-ai font-bold uppercase">AI 建议</span>
                <button class="text-[10px] text-text-muted hover:text-ai" @click="aiSuggestion = null">
                  清除
                </button>
              </div>
              <div v-if="isAnalyzing && !aiSuggestion" class="flex items-center gap-2 py-2 text-xs text-text-muted">
                <NLoadingState size="sm" /> 正在分析并生成构思...
              </div>
              <div v-else class="max-h-60 overflow-y-auto text-xs leading-relaxed italic" :class="aiSuggestion?.startsWith('Error:') ? 'text-error font-medium not-italic' : 'text-text-secondary'">
                {{ aiSuggestion }}
              </div>
              <p v-if="aiSuggestion && !aiSuggestion.startsWith('Error:')" class="text-[10px] text-text-muted">
                复制并手动更新到左侧表单中。
              </p>
              <NButton v-if="aiSuggestion?.startsWith('Error:')" size="sm" variant="ghost" class="w-full text-xs" @click="handleAIAnalyze">
                重试
              </NButton>
            </div>
          </div>

          <div>
            <h3 class="mb-4 text-xs text-text-muted font-bold tracking-wider uppercase">
              剧情登场记录
            </h3>
            <div class="space-y-2">
              <p class="border border-border-light rounded-lg border-dashed py-4 text-center text-xs text-text-muted">
                暂无登场记录。
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <NConfirmDialog
      v-model="showDeleteConfirm"
      title="删除角色"
      description="你确定要删除这个角色吗？这将同时移除所有关联的人际关系。此操作不可撤销。"
      confirm-text="确定删除"
      variant="danger"
      @confirm="handleConfirmDelete"
    />
  </NAppLayout>
</template>

<style scoped>
.animate-in {
  animation: animate-in 0.3s ease-out;
}
@keyframes animate-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
