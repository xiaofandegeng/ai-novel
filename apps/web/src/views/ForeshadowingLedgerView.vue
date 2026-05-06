<script setup lang="ts">
import type { ForeshadowingStatus } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NConfirmDialog,
  NLoadingState,
  NTag,
  NTextArea,
} from '@ai-novel/ui'
import {
  Lightbulb,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import {
  FORESHADOWING_STATUS_LABEL,
  FORESHADOWING_STATUS_VARIANT,
  useForeshadowingWorkspace,
} from '../features/foreshadowing/composables/useForeshadowingWorkspace'

const route = useRoute()
const projectId = route.params.id as string

const {
  loading,
  selectedId,
  showDeleteConfirm,
  form,
  selectedItem,
  groupedItems,
  projectStore,
  selectItem,
  handleCreate,
  handleUpdate,
  handleDelete,
  resetForm,
} = useForeshadowingWorkspace(projectId)

const statusLabel = FORESHADOWING_STATUS_LABEL
const statusVariant = FORESHADOWING_STATUS_VARIANT
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
              <NTextArea v-model="form.description" label="描述" :rows="3" placeholder="伏笔内容描述" />
            </div>

            <div>
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
