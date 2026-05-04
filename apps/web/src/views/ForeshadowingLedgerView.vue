<script setup lang="ts">
import type { ForeshadowingImportance, ForeshadowingStatus } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NConfirmDialog,
  NLoadingState,
  NTag,
  NTextArea,
  useToast,
} from '@ai-novel/ui'
import {
  Lightbulb,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useForeshadowingStore, useProjectStore } from '../stores/projects'

const route = useRoute()
const projectId = route.params.id as string
const toast = useToast()

const projectStore = useProjectStore()
const foreshadowingStore = useForeshadowingStore()

const loading = ref(true)
const selectedId = ref<string | null>(null)
const showDeleteConfirm = ref(false)

const form = ref({
  title: '',
  description: '',
  setupChapterId: '',
  expectedPayoffChapterId: '',
  status: 'open' as ForeshadowingStatus,
  importance: 'normal' as ForeshadowingImportance,
  relatedCharacters: '',
  relatedEvents: '',
  notes: '',
})

const selectedItem = computed(() =>
  foreshadowingStore.items.find(i => i.id === selectedId.value),
)

const statusLabel: Record<ForeshadowingStatus, string> = {
  open: '待回收',
  progressing: '推进中',
  paid_off: '已回收',
  abandoned: '已放弃',
}
const statusVariant: Record<ForeshadowingStatus, 'info' | 'warning' | 'success' | 'default'> = {
  open: 'info',
  progressing: 'warning',
  paid_off: 'success',
  abandoned: 'default',
}

const groupedItems = computed(() => {
  const groups: Record<string, typeof foreshadowingStore.items> = {
    open: [],
    progressing: [],
    paid_off: [],
    abandoned: [],
  }
  for (const item of foreshadowingStore.items) {
    groups[item.status].push(item)
  }
  return groups
})

onMounted(async () => {
  try {
    await Promise.all([
      projectStore.fetchProject(projectId),
      foreshadowingStore.fetchItems(projectId),
    ])
  }
  catch {
    toast.add('加载伏笔台账失败', 'error')
  }
  finally {
    loading.value = false
  }
})

function selectItem(id: string) {
  selectedId.value = id
  const item = foreshadowingStore.items.find(i => i.id === id)
  if (item) {
    form.value = {
      title: item.title,
      description: item.description || '',
      setupChapterId: item.setupChapterId || '',
      expectedPayoffChapterId: item.expectedPayoffChapterId || '',
      status: item.status,
      importance: item.importance,
      relatedCharacters: item.relatedCharacters || '',
      relatedEvents: item.relatedEvents || '',
      notes: item.notes || '',
    }
  }
}

async function handleCreate() {
  try {
    const item = await foreshadowingStore.createItem(projectId, {
      title: form.value.title,
      description: form.value.description || undefined,
      status: form.value.status,
      importance: form.value.importance,
      relatedCharacters: form.value.relatedCharacters || undefined,
      relatedEvents: form.value.relatedEvents || undefined,
      notes: form.value.notes || undefined,
    })
    selectedId.value = item.id
    toast.add('伏笔已创建', 'success')
  }
  catch {
    toast.add('创建失败', 'error')
  }
}

async function handleUpdate() {
  if (!selectedId.value)
    return
  try {
    await foreshadowingStore.updateItem(projectId, selectedId.value, {
      title: form.value.title,
      description: form.value.description || null,
      status: form.value.status,
      importance: form.value.importance,
      relatedCharacters: form.value.relatedCharacters || null,
      relatedEvents: form.value.relatedEvents || null,
      notes: form.value.notes || null,
    })
    toast.add('伏笔已更新', 'success')
  }
  catch {
    toast.add('更新失败', 'error')
  }
}

async function handleDelete() {
  if (!selectedId.value)
    return
  try {
    await foreshadowingStore.deleteItem(projectId, selectedId.value)
    selectedId.value = null
    toast.add('伏笔已删除', 'success')
  }
  catch {
    toast.add('删除失败', 'error')
  }
}

function resetForm() {
  selectedId.value = null
  form.value = {
    title: '',
    description: '',
    setupChapterId: '',
    expectedPayoffChapterId: '',
    status: 'open',
    importance: 'normal',
    relatedCharacters: '',
    relatedEvents: '',
    notes: '',
  }
}
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中...'"
    :project-id="projectId"
  >
    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <div class="h-full flex">
      <!-- Left: Item list -->
      <div class="w-80 shrink-0 overflow-y-auto border-r border-border-light">
        <div class="flex items-center justify-between border-b border-border-light p-4">
          <h2 class="text-sm text-text-primary font-bold">
            伏笔台账
          </h2>
          <NButton variant="ghost" size="sm" @click="resetForm">
            <Plus :size="14" class="mr-1" /> 新建
          </NButton>
        </div>

        <NLoadingState v-if="loading" />
        <div v-else>
          <div v-for="(items, status) in groupedItems" :key="status">
            <div v-if="items.length > 0" class="px-4 pb-1 pt-3">
              <span class="text-xs text-text-muted font-semibold">{{ statusLabel[status as ForeshadowingStatus] }} ({{ items.length }})</span>
            </div>
            <div
              v-for="item in items"
              :key="item.id"
              class="mx-2 mb-1 cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors"
              :class="selectedId === item.id ? 'bg-primary-soft text-primary' : 'hover:bg-bg-subtle text-text-secondary'"
              @click="selectItem(item.id)"
            >
              <div class="flex items-center gap-2">
                <Lightbulb :size="14" class="shrink-0" />
                <span class="truncate font-medium">{{ item.title }}</span>
                <NTag :variant="statusVariant[item.status]" size="sm" class="ml-auto shrink-0">
                  {{ item.importance === 'major' ? '重要' : '' }}
                </NTag>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Detail / Create form -->
      <div class="flex-1 overflow-y-auto p-6">
        <NLoadingState v-if="loading" />
        <div v-else-if="!selectedId" class="py-12 text-center text-text-muted">
          <Lightbulb :size="32" class="mx-auto mb-3 opacity-40" />
          <p class="text-sm">
            选择一个伏笔项查看详情，或点击"新建"创建
          </p>
        </div>
        <div v-else class="mx-auto max-w-xl space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base text-text-primary font-bold">
              {{ selectedItem?.title || '新建伏笔' }}
            </h3>
            <NConfirmDialog
              v-model="showDeleteConfirm"
              title="删除伏笔"
              description="确定要删除这个伏笔项吗？"
              confirm-text="确定删除"
              variant="danger"
              @confirm="handleDelete"
            />
            <NButton variant="ghost" size="sm" class="text-text-muted hover:text-red-500" @click="showDeleteConfirm = true">
              <Trash2 :size="14" />
            </NButton>
          </div>

          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-text-muted">标题</label>
              <input
                v-model="form.title"
                class="w-full border border-border-light rounded-md bg-bg-page px-3 py-2 text-sm"
                placeholder="伏笔标题"
              >
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-text-muted">状态</label>
                <select
                  v-model="form.status"
                  class="w-full border border-border-light rounded-md bg-bg-page px-3 py-2 text-sm"
                >
                  <option value="open">
                    待回收
                  </option>
                  <option value="progressing">
                    推进中
                  </option>
                  <option value="paid_off">
                    已回收
                  </option>
                  <option value="abandoned">
                    已放弃
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs text-text-muted">重要性</label>
                <select
                  v-model="form.importance"
                  class="w-full border border-border-light rounded-md bg-bg-page px-3 py-2 text-sm"
                >
                  <option value="major">
                    重要
                  </option>
                  <option value="normal">
                    普通
                  </option>
                  <option value="minor">
                    次要
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs text-text-muted">描述</label>
              <NTextArea v-model="form.description" label="描述" :rows="3" placeholder="伏笔内容描述" />
            </div>

            <div>
              <label class="mb-1 block text-xs text-text-muted">备注</label>
              <NTextArea v-model="form.notes" label="备注" :rows="2" placeholder="备注信息" />
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <NButton @click="selectedItem ? handleUpdate() : handleCreate()">
                {{ selectedItem ? '保存修改' : '创建伏笔' }}
              </NButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </NAppLayout>
</template>
