<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NConfirmDialog,
  NInput,
  NLoadingState,
  NSelect,
  NTextArea,
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
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useCharacterWorkspace } from '../features/characters/composables/useCharacterWorkspace'
import { characterRoleOptions, getCharacterRoleLabel } from '../utils/character-labels'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string

const {
  loading,
  saving,
  searchQuery,
  selectedCharId,
  showDeleteConfirm,
  charForm,
  charRoleModel,
  isAnalyzing,
  aiProposal,
  aiError,
  proposedFieldItems,
  candidateRoleLabel,
  proposedCandidates,
  filteredCharacters,
  projectStore,
  selectCharacter,
  handleAddCharacter,
  handleSave,
  confirmDelete,
  handleConfirmDelete,
  handleAIAnalyze,
  handleAINewCharacter,
  handleAIMinorCharacters,
  applyAIToCurrentCharacter,
  createCharacterFromAI,
  createCandidateFromAI,
  createAllMinorCharactersFromAI,
  clearAIProposal,
  retryAIRequest,
} = useCharacterWorkspace(projectId)

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
            <NButton variant="ghost" size="sm" aria-label="添加角色" @click="handleAddCharacter">
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

          <div class="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
            <div v-if="activeTab === 'profile'" class="grid gap-6">
              <NTextArea v-model="charForm.personality" label="性格概括" placeholder="表面特征、生活习惯、口头禅..." :rows="4" />
              <NTextArea v-model="charForm.goal" label="当前目标" placeholder="他们现在最想要的是什么？" :rows="3" />
            </div>
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
            <NButton
              variant="ghost"
              size="sm"
              class="mt-2 w-full"
              :loading="isAnalyzing"
              @click="handleAINewCharacter"
            >
              <UserPlus :size="14" class="mr-1.5" /> AI 推荐新角色
            </NButton>
            <NButton
              variant="ghost"
              size="sm"
              class="mt-2 w-full"
              :loading="isAnalyzing"
              @click="handleAIMinorCharacters"
            >
              批量生成小角色
            </NButton>

            <div v-if="isAnalyzing || aiProposal !== null || aiError" class="animate-in fade-in slide-in-from-top-2 mt-4 border border-ai/20 rounded-lg bg-white p-3 shadow-sm space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-[10px] text-ai font-bold uppercase">AI 建议确认区</span>
                <button class="text-[10px] text-text-muted hover:text-ai" @click="clearAIProposal">
                  清除
                </button>
              </div>
              <div v-if="isAnalyzing && !aiProposal" class="flex items-center gap-2 py-2 text-xs text-text-muted">
                <NLoadingState size="sm" /> 正在分析并生成构思...
              </div>
              <div v-else-if="aiError" class="border-error/20 bg-error/5 text-error border rounded-md p-3 text-xs font-medium">
                {{ aiError }}
              </div>
              <template v-else-if="aiProposal">
                <p v-if="aiProposal.summary" class="text-xs text-text-secondary leading-relaxed">
                  {{ aiProposal.summary }}
                </p>

                <div v-if="aiProposal.kind === 'enrich'" class="space-y-2">
                  <div
                    v-for="item in proposedFieldItems"
                    :key="item.key"
                    class="border border-border-light rounded-md bg-bg-subtle p-2"
                  >
                    <p class="mb-1 text-[10px] text-text-muted font-semibold">
                      {{ item.label }}
                    </p>
                    <p class="whitespace-pre-wrap text-xs text-text-primary leading-relaxed">
                      {{ item.value }}
                    </p>
                  </div>
                  <p v-if="proposedFieldItems.length === 0" class="text-xs text-text-muted">
                    暂无可回填字段。
                  </p>
                  <div v-if="proposedFieldItems.length > 0" class="grid grid-cols-2 gap-2">
                    <NButton size="sm" variant="ai" class="text-xs" @click="applyAIToCurrentCharacter('fill_empty')">
                      填入空白字段
                    </NButton>
                    <NButton size="sm" variant="ghost" class="text-xs" @click="applyAIToCurrentCharacter('replace')">
                      覆盖对应字段
                    </NButton>
                  </div>
                </div>

                <div v-else-if="aiProposal.kind === 'create'" class="space-y-3">
                  <div class="border border-border-light rounded-md bg-bg-subtle p-3">
                    <p class="text-sm text-text-primary font-semibold">
                      {{ aiProposal.candidate?.name || 'AI 推荐角色' }}
                    </p>
                    <p class="mt-1 text-xs text-text-muted">
                      {{ candidateRoleLabel }}
                    </p>
                    <p v-if="aiProposal.candidate?.relationSuggestions?.length" class="mt-2 text-[10px] text-text-muted">
                      将自动关联 {{ aiProposal.candidate.relationSuggestions.length }} 段人物关系
                    </p>
                  </div>
                  <div class="max-h-56 overflow-y-auto space-y-2">
                    <div
                      v-for="item in proposedFieldItems"
                      :key="item.key"
                      class="border border-border-light rounded-md p-2"
                    >
                      <p class="mb-1 text-[10px] text-text-muted font-semibold">
                        {{ item.label }}
                      </p>
                      <p class="whitespace-pre-wrap text-xs text-text-primary leading-relaxed">
                        {{ item.value }}
                      </p>
                    </div>
                  </div>
                  <NButton size="sm" variant="ai" class="w-full text-xs" @click="createCharacterFromAI">
                    创建并选中该角色
                  </NButton>
                </div>

                <div v-else class="space-y-3">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-xs text-text-muted">
                      共 {{ proposedCandidates.length }} 个小角色候选
                    </p>
                    <NButton
                      v-if="proposedCandidates.length > 0"
                      size="sm"
                      variant="ai"
                      class="text-xs"
                      @click="createAllMinorCharactersFromAI"
                    >
                      全部创建
                    </NButton>
                  </div>

                  <div class="max-h-80 overflow-y-auto space-y-2">
                    <div
                      v-for="candidate in proposedCandidates"
                      :key="candidate.name"
                      class="border border-border-light rounded-md bg-bg-subtle p-3 space-y-2"
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div>
                          <p class="text-sm text-text-primary font-semibold">
                            {{ candidate.name }}
                          </p>
                          <p class="mt-0.5 text-[10px] text-text-muted">
                            {{ getCharacterRoleLabel(candidate.role) }}
                          </p>
                        </div>
                        <NButton size="sm" variant="ghost" class="shrink-0 text-xs" @click="createCandidateFromAI(candidate)">
                          创建
                        </NButton>
                      </div>
                      <p v-if="candidate.personality" class="text-xs text-text-secondary leading-relaxed">
                        {{ candidate.personality }}
                      </p>
                      <p v-if="candidate.goal" class="text-[10px] text-text-muted leading-relaxed">
                        用途：{{ candidate.goal }}
                      </p>
                      <p v-if="candidate.relationSuggestions?.length" class="text-[10px] text-text-muted leading-relaxed">
                        关系：{{ candidate.relationSuggestions.map(rel => rel.targetName).join('、') }}
                      </p>
                    </div>
                  </div>
                </div>
              </template>
              <NButton v-if="aiError" size="sm" variant="ghost" class="w-full text-xs" @click="retryAIRequest">
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
