<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NConfirmDialog,
  NEmptyState,
  NInput,
  NLoadingState,
  NModal,
  NPanel,
  NSelect,
  NTag,
  NTextArea,
} from '@ai-novel/ui'
import { useProjectLabels } from '@/composables/useProjectLabels'
import { getCharacterRoleLabel } from '@/utils/character-labels'
import { useDataViewer } from '../composables/useDataViewer'

const {
  loading,
  selectedProjectId,
  showCreateModal,
  showEditProjectModal,
  createError,
  formTitle,
  formGenre,
  formTheme,
  formTargetWords,
  showDeleteConfirm,
  pendingDelete,
  showCharacterModal,
  editingCharacterId,
  charForm,
  showVolumeModal,
  volForm,
  showChapterModal,
  chForm,
  showBibleModal,
  bibleForm,
  projectStore,
  storyBibleStore,
  characterStore,
  volumeStore,
  chapterStore,
  selectProject,
  deselectProject,
  openCreateModal,
  openEditProjectModal,
  handleCreate,
  handleUpdateProject,
  handleConfirmDelete,
  confirmDelete,
  openCreateCharacterModal,
  openEditCharacterModal,
  handleSaveCharacter,
  handleDeleteCharacter,
  openCreateVolumeModal,
  handleCreateVolume,
  handleDeleteVolume,
  openCreateChapterModal,
  handleCreateChapter,
  handleDeleteChapter,
  openEditBibleModal,
  handleSaveBible,
  formatDate,
  getVolumesForChapter,
} = useDataViewer()

const { projectStatusVariants: statusVariantMap, chapterStatusVariants: chapterStatusVariantMap } = useProjectLabels()
</script>

<template>
  <NAppLayout :project-name="projectStore.currentProject?.title || '项目工作台'">
    <template #nav>
      <div class="h-full flex flex-col">
        <div class="flex items-center justify-between border-b border-border-light p-4">
          <h2 class="text-base text-text-primary font-semibold">
            项目列表
          </h2>
          <NButton size="sm" @click="openCreateModal">
            + 新建
          </NButton>
        </div>

        <NLoadingState v-if="loading" variant="text" :rows="6" />

        <NEmptyState
          v-else-if="projectStore.projects.length === 0"
          title="暂无项目"
          description="创建第一个小说项目后开始调试数据流程"
        >
          <template #action>
            <NButton size="sm" @click="openCreateModal">
              创建项目
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
                title="删除项目"
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
      <div class="mb-4 flex items-center gap-3 px-6 pt-6">
        <NTag variant="warning" size="sm">
          开发调试页
        </NTag>
        <p class="text-sm text-text-muted">
          此页面用于检查种子数据和 CRUD 接口，不属于正式创作流程。
        </p>
      </div>

      <div v-if="!selectedProjectId" class="h-full flex items-center justify-center">
        <NEmptyState
          title="请选择项目"
          description="从侧边栏选择一个项目以查看详情"
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
                目标：{{ projectStore.currentProject.targetWords.toLocaleString() }} 字
              </span>
            </div>
            <p v-if="projectStore.currentProject?.theme" class="mt-1 text-sm text-text-muted">
              主题：{{ projectStore.currentProject.theme }}
            </p>
          </div>
          <div class="flex gap-2">
            <NButton variant="ghost" size="sm" @click="openEditProjectModal">
              编辑项目
            </NButton>
            <NButton variant="secondary" size="sm" @click="deselectProject">
              返回
            </NButton>
          </div>
        </div>

        <!-- Story Bible -->
        <NPanel title="故事设定集" description="世界观构建与叙事规则">
          <template #actions>
            <NButton size="sm" variant="ghost" @click="openEditBibleModal">
              {{ storyBibleStore.storyBible ? '编辑' : '创建' }} 设定集
            </NButton>
          </template>
          <template v-if="storyBibleStore.storyBible">
            <div class="space-y-3">
              <div v-if="storyBibleStore.storyBible.worldview">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  世界观
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.worldview }}
                </p>
              </div>
              <div v-if="storyBibleStore.storyBible.mainConflict">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  主线冲突
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.mainConflict }}
                </p>
              </div>
              <div v-if="storyBibleStore.storyBible.theme">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  主题
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.theme }}
                </p>
              </div>
              <div v-if="storyBibleStore.storyBible.rules">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  系统规则
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.rules }}
                </p>
              </div>
              <div v-if="storyBibleStore.storyBible.timeline">
                <div class="text-xs text-text-muted font-medium tracking-wide uppercase">
                  时间线
                </div>
                <p class="mt-1 text-sm text-text-primary">
                  {{ storyBibleStore.storyBible.timeline }}
                </p>
              </div>
            </div>
          </template>
          <template v-else>
            <p class="text-sm text-text-muted">
              尚未创建故事设定集。
            </p>
          </template>
        </NPanel>

        <!-- Characters -->
        <NPanel title="角色" :description="`共 ${characterStore.characters.length} 个角色`">
          <template #actions>
            <NButton size="sm" @click="openCreateCharacterModal">
              + 添加角色
            </NButton>
          </template>
          <div v-if="characterStore.characters.length === 0" class="text-sm text-text-muted">
            尚未定义角色。
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
                    {{ getCharacterRoleLabel(char.role) }}
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
                目标：{{ char.goal }}
              </p>
              <p v-if="char.personality" class="mt-1 text-xs text-text-muted">
                性格：{{ char.personality }}
              </p>
            </div>
          </div>
        </NPanel>

        <!-- Volumes -->
        <NPanel title="分卷" :description="`${volumeStore.volumes.length} 个分卷`">
          <template #actions>
            <NButton size="sm" @click="openCreateVolumeModal">
              + 添加分卷
            </NButton>
          </template>
          <div v-if="volumeStore.volumes.length === 0" class="text-sm text-text-muted">
            尚未定义分卷。
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
                  title="删除分卷"
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
        <NPanel title="章节" :description="`${chapterStore.chapters.length} 个章节`">
          <template #actions>
            <NButton size="sm" @click="openCreateChapterModal">
              + 添加章节
            </NButton>
          </template>
          <div v-if="chapterStore.chapters.length === 0" class="text-sm text-text-muted">
            尚未定义章节。
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
                  <span v-if="ch.outline">有大纲</span>
                  <span v-if="ch.draft">{{ ch.draft.length }} 字草稿</span>
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
          <span>创建：{{ projectStore.currentProject ? formatDate(projectStore.currentProject.createdAt) : '' }}</span>
          <span>更新：{{ projectStore.currentProject ? formatDate(projectStore.currentProject.updatedAt) : '' }}</span>
        </div>
      </div>

      <!-- Create Project Modal -->
      <NModal v-model="showCreateModal" title="创建新项目">
        <form class="space-y-4" @submit.prevent="handleCreate">
          <NInput
            v-model="formTitle"
            label="标题"
            placeholder="输入项目标题"
            :error="createError && !formTitle.trim() ? '请输入项目标题' : ''"
          />
          <NInput
            v-model="formGenre"
            label="类型"
            placeholder="如：奇幻、科幻、言情"
          />
          <NInput
            v-model="formTheme"
            label="主题"
            placeholder="如：救赎、成长、复仇"
          />
          <NInput
            v-model="formTargetWords"
            label="目标字数"
            placeholder="如：80000"
            type="number"
          />
          <p v-if="createError && formTitle.trim()" class="text-xs text-semantic-error">
            {{ createError }}
          </p>
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showCreateModal = false">
              取消
            </NButton>
            <NButton variant="primary" @click="handleCreate">
              创建项目
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Edit Project Modal -->
      <NModal v-model="showEditProjectModal" title="编辑项目">
        <form class="space-y-4" @submit.prevent="handleUpdateProject">
          <NInput v-model="formTitle" label="标题" placeholder="项目标题" />
          <NInput v-model="formGenre" label="类型" placeholder="小说类型" />
          <NInput v-model="formTheme" label="主题" placeholder="核心主题" />
          <NInput v-model="formTargetWords" label="目标字数" type="number" />
          <p v-if="createError" class="text-xs text-semantic-error">
            {{ createError }}
          </p>
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showEditProjectModal = false">
              取消
            </NButton>
            <NButton variant="primary" @click="handleUpdateProject">
              保存更改
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Character Modal -->
      <NModal v-model="showCharacterModal" :title="editingCharacterId ? '编辑角色' : '创建角色'">
        <form class="space-y-4" @submit.prevent="handleSaveCharacter">
          <NInput v-model="charForm.name" label="姓名" placeholder="角色姓名" />
          <NInput v-model="charForm.role" label="角色定位" placeholder="如：主角、反派、配角" />
          <NInput v-model="charForm.goal" label="目标" placeholder="角色的核心目标" />
          <NTextArea v-model="charForm.personality" label="性格" placeholder="描述角色性格" />
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showCharacterModal = false">
              取消
            </NButton>
            <NButton variant="primary" @click="handleSaveCharacter">
              {{ editingCharacterId ? '保存' : '创建' }}
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Volume Modal -->
      <NModal v-model="showVolumeModal" title="创建分卷">
        <form class="space-y-4" @submit.prevent="handleCreateVolume">
          <NInput v-model="volForm.title" label="标题" placeholder="分卷标题" />
          <NTextArea v-model="volForm.summary" label="摘要" placeholder="简短摘要" />
          <NInput v-model="volForm.orderIndex" label="排序序号" type="number" />
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showVolumeModal = false">
              取消
            </NButton>
            <NButton variant="primary" @click="handleCreateVolume">
              创建
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Chapter Modal -->
      <NModal v-model="showChapterModal" title="创建章节">
        <form class="space-y-4" @submit.prevent="handleCreateChapter">
          <NInput v-model="chForm.title" label="标题" placeholder="Chapter title" />
          <NInput v-model="chForm.chapterNumber" label="章节序号" type="number" />
          <NSelect
            v-model="chForm.volumeId"
            label="分卷"
            :options="volumeStore.volumes.map((v: any) => ({ label: v.title, value: v.id }))"
            placeholder="选择分卷"
          />
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showChapterModal = false">
              取消
            </NButton>
            <NButton variant="primary" @click="handleCreateChapter">
              创建
            </NButton>
          </div>
        </template>
      </NModal>

      <!-- Story Bible Modal -->
      <NModal v-model="showBibleModal" :title="storyBibleStore.storyBible ? '编辑故事设定集' : '创建故事设定集'">
        <form class="space-y-4" @submit.prevent="handleSaveBible">
          <NTextArea v-model="bibleForm.worldview" label="世界观" placeholder="描述故事世界" />
          <NTextArea v-model="bibleForm.mainConflict" label="主线冲突" placeholder="故事的核心冲突是什么？" />
          <NTextArea v-model="bibleForm.theme" label="主题" placeholder="核心主题" />
          <NTextArea v-model="bibleForm.rules" label="系统规则" placeholder="魔法体系、社会规则等" />
          <NTextArea v-model="bibleForm.timeline" label="时间线" placeholder="Key events" />
        </form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <NButton variant="ghost" @click="showBibleModal = false">
              取消
            </NButton>
            <NButton variant="primary" @click="handleSaveBible">
              保存
            </NButton>
          </div>
        </template>
      </NModal>

      <NConfirmDialog
        v-model="showDeleteConfirm"
        :title="pendingDelete?.title || '删除'"
        :description="pendingDelete?.description || '确定要执行此操作吗？'"
        :confirm-text="pendingDelete?.title || '确认'"
        variant="danger"
        @confirm="handleConfirmDelete"
      />
    </template>
  </NAppLayout>
</template>
