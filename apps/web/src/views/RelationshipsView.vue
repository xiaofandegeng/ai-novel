<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NConfirmDialog,
  NLoadingState,
  NTag,
  NTextArea,
} from '@ai-novel/ui'
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  Heart,
  Info,
  Loader2,
  Plus,
  Share2,
  Shield,
  Sparkles,
  Sword,
  Trash2,
  UserCircle2,
  Users,
  X,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useRelationshipWorkspace } from '../features/relationships/composables/useRelationshipWorkspace'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string

const {
  loading,
  saving,
  inferring,
  suggestions,
  selectedRelId,
  showDeleteConfirm,
  relForm,
  projectStore,
  relationshipStore,
  selectRelationship,
  handleAdd,
  handleSave,
  confirmDelete,
  handleConfirmDelete,
  handleInferRelationships,
  handleAcceptSuggestion,
  handleRejectSuggestion,
  getCharName,
} = useRelationshipWorkspace(projectId)

const relationshipTypes = [
  { value: 'ally', label: '盟友 / 朋友', icon: Users },
  { value: 'enemy', label: '敌人 / 仇敌', icon: Sword },
  { value: 'lover', label: '恋人 / 情侣', icon: Heart },
  { value: 'family', label: '家人 / 血缘', icon: Info },
  { value: 'mentor', label: '导师 / 徒弟', icon: Info },
  { value: 'rival', label: '竞争对手', icon: Sword },
  { value: 'victim', label: '受害者', icon: Info },
  { value: 'key_holder', label: '关键持有人', icon: Info },
  { value: 'connected', label: '关联', icon: Info },
  { value: 'source', label: '来源', icon: Info },
  { value: 'former_lover', label: '前恋人', icon: Heart },
  { value: 'manipulator', label: '操纵者', icon: Sword },
  { value: 'buyer', label: '买家', icon: Users },
  { value: 'acquaintance', label: '点头之交', icon: Users },
  { value: 'anchor', label: '锚点 / 精神寄托', icon: Info },
  { value: 'deceiver', label: '欺骗者', icon: Sword },
  { value: 'protector', label: '保护者', icon: Shield },
  { value: 'obsessive', label: '执念 / 迷恋', icon: Heart },
  { value: 'betrayer', label: '背叛者', icon: Sword },
]

function getRelTypeLabel(type: string): string {
  if (!type)
    return '未知'
  const lowerType = type.toLowerCase()
  // 处理 slash 分隔的情况，如 source/connected
  if (lowerType.includes('/')) {
    return lowerType.split('/').map(t => getRelTypeLabel(t.trim())).join('/')
  }
  return relationshipTypes.find(t => t.value === lowerType)?.label || type
}

const relationshipOptions = computed(() => {
  const options = [...relationshipTypes]
  if (relForm.value.type && !options.find(o => o.value === relForm.value.type)) {
    options.push({
      value: relForm.value.type,
      label: relForm.value.type,
      icon: Info,
    })
  }
  return options
})
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || '加载中…'" :project-id="projectId">
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

    <div class="h-full flex overflow-hidden bg-bg-page">
      <aside class="w-80 flex shrink-0 flex-col border-r border-border-light bg-bg-surface">
        <div class="flex items-center justify-between border-b border-border-light p-4">
          <h2 class="flex items-center gap-2 text-sm text-text-primary font-bold tracking-wider uppercase">
            <NButton variant="ghost" size="sm" class="h-8 w-8 p-0 -ml-2" @click="router.back()">
              <ChevronLeft :size="18" />
            </NButton>
            <Share2 :size="16" /> 角色关系网
          </h2>
          <div class="flex gap-1">
            <NButton variant="ghost" size="sm" title="一键推导关系网" @click="handleInferRelationships">
              <Sparkles :size="16" class="text-primary" />
            </NButton>
            <NButton variant="ghost" size="sm" aria-label="添加关系" @click="handleAdd">
              <Plus :size="16" />
            </NButton>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            v-for="rel in relationshipStore.relationships"
            :key="rel.id"
            class="w-full border rounded-xl px-4 py-3 text-left transition-all"
            :class="selectedRelId === rel.id
              ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/10'
              : 'border-transparent hover:bg-bg-subtle text-text-secondary'"
            @click="selectRelationship(rel.id)"
          >
            <div class="mb-1 flex items-center gap-2">
              <span class="text-xs text-text-primary font-bold">{{ getCharName(rel.characterAId) }}</span>
              <span class="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] text-text-muted">↔</span>
              <span class="text-xs text-text-primary font-bold">{{ getCharName(rel.characterBId) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <NTag size="sm" :variant="rel.type === 'enemy' || rel.type === 'rival' ? 'error' : 'info'">
                {{ getRelTypeLabel(rel.type) }}
              </NTag>
              <span class="text-[10px] text-text-muted">亲密度: {{ rel.strength }}/10</span>
            </div>
          </button>
        </div>

        <!-- Pending Suggestions -->
        <div v-if="suggestions.length > 0" class="mt-4 px-2">
          <div class="mb-2 flex items-center gap-2 px-2 text-[10px] text-primary font-bold tracking-wider uppercase">
            <Sparkles :size="12" /> 待确认建议 (AI 推导)
          </div>
          <div class="space-y-2">
            <div
              v-for="s in suggestions"
              :key="s.id"
              class="group animate-in fade-in slide-in-from-left-2 relative border border-primary/20 rounded-lg bg-primary/5 p-3 duration-300"
            >
              <div class="mb-1 flex items-center gap-2">
                <span class="text-xs text-text-primary font-bold">{{ s.payload.characterAName }}</span>
                <span class="rounded bg-primary/10 px-1 py-0.5 text-[9px] text-primary">{{ getRelTypeLabel(s.payload.type) }}</span>
                <span class="text-xs text-text-primary font-bold">{{ s.payload.characterBName }}</span>
              </div>
              <p class="line-clamp-2 text-[10px] text-text-muted leading-tight">
                {{ s.payload.description }}
              </p>
              <div class="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <NButton size="sm" variant="primary" class="h-6 flex-1 text-[10px]" @click="handleAcceptSuggestion(s.id)">
                  <Check :size="10" class="mr-1" /> 采纳
                </NButton>
                <NButton size="sm" variant="ghost" class="h-6 flex-1 text-[10px]" @click="handleRejectSuggestion(s.id)">
                  <X :size="10" class="mr-1" /> 忽略
                </NButton>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main class="relative flex-1 overflow-y-auto bg-bg-page p-8">
        <!-- AI Inference Overlay -->
        <div v-if="inferring" class="animate-in fade-in absolute inset-0 z-50 flex items-center justify-center bg-bg-page/80 backdrop-blur-sm duration-300">
          <div class="flex flex-col items-center gap-4 text-center">
            <div class="relative">
              <Sparkles :size="48" class="animate-pulse text-primary" />
              <Loader2 :size="64" class="absolute left-1/2 top-1/2 animate-spin text-primary/30 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div>
              <h3 class="text-lg text-text-primary font-bold">
                正在深度推演关系网...
              </h3>
              <p class="mt-1 text-sm text-text-muted">
                AI 正在根据角色档案分析潜在联系
              </p>
            </div>
          </div>
        </div>

        <div v-if="loading" class="h-64 flex items-center justify-center">
          <NLoadingState />
        </div>

        <div v-else-if="!selectedRelId" class="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
          <Share2 :size="64" stroke-width="1" class="mb-4" />
          <p>选择一段人物羁绊进行管理</p>
        </div>

        <div v-else class="animate-in fade-in slide-in-from-bottom-2 mx-auto max-w-2xl duration-300 space-y-8">
          <header class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl text-text-primary font-bold">
                人物关系档案
              </h1>
              <p class="text-sm text-text-muted">
                {{ getCharName(relForm.characterAId) }} 与 {{ getCharName(relForm.characterBId) }} 之间的互动关系
              </p>
            </div>
            <div class="flex gap-2">
              <NButton variant="ghost" size="sm" class="text-semantic-error" @click="confirmDelete">
                <Trash2 :size="16" />
              </NButton>
              <NButton variant="primary" size="sm" :loading="saving" @click="handleSave">
                保存更改
              </NButton>
            </div>
          </header>

          <div class="grid items-center gap-8 border border-border-light rounded-lg bg-bg-surface p-6 py-6 shadow-sm md:grid-cols-2">
            <div class="flex flex-col items-center gap-3">
              <UserCircle2 :size="48" class="text-text-muted" />
              <span class="text-sm text-text-primary font-bold">{{ getCharName(relForm.characterAId) }}</span>
            </div>
            <div class="relative flex flex-col items-center gap-1">
              <div class="absolute top-1/2 h-0.5 w-full bg-border-strong -z-10 -translate-y-1/2" />
              <div class="rounded-full bg-primary px-3 py-1 text-xs text-white font-bold uppercase shadow-sm">
                {{ relForm.type }}
              </div>
            </div>
            <div class="flex flex-col items-center gap-3">
              <UserCircle2 :size="48" class="text-text-muted" />
              <span class="text-sm text-text-primary font-bold">{{ getCharName(relForm.characterBId) }}</span>
            </div>
          </div>

          <div class="space-y-6">
            <div class="grid gap-6 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs text-text-muted font-bold tracking-wider uppercase">羁绊类型</label>
                <select v-model="relForm.type" class="w-full border border-border-light rounded-lg bg-bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option v-for="type in relationshipOptions" :key="type.value" :value="type.value">
                    {{ type.label }}
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <label class="text-xs text-text-muted font-bold tracking-wider uppercase">情感强度 (1-10)</label>
                <div class="flex items-center gap-4">
                  <input v-model.number="relForm.strength" type="range" min="1" max="10" class="flex-1 accent-primary">
                  <span class="w-8 text-center text-primary font-bold">{{ relForm.strength }}</span>
                </div>
              </div>
            </div>

            <NTextArea v-model="relForm.status" label="当前互动状态" placeholder="例：背叛发生后的冷战僵持期..." :rows="2" />
            <NTextArea v-model="relForm.description" label="历史与演变" placeholder="这段关系是如何开始的？经历了哪些关键转折？" :rows="6" />
          </div>
        </div>
      </main>
    </div>

    <NConfirmDialog
      v-model="showDeleteConfirm"
      title="删除人物关系"
      description="你确定要删除这段人物联结吗？此操作不可撤销。"
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
