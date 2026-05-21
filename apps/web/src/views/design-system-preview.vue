<script setup lang="ts">
import {
  NAppLayout,
  NButton,
  NDrawer,
  NEmptyState,
  NErrorState,
  NIconButton,
  NInput,
  NLoadingState,
  NModal,
  NPanel,
  NSelect,
  NTag,
  NTextArea,
  useToast,
} from '@ai-novel/ui'
import { ref } from 'vue'

const projectName = ref('镜中城')
const inputError = ref('')
const genre = ref('fantasy')
const textareaValue = ref('')
const loading = ref(false)
const drawerOpen = ref(false)
const modalOpen = ref(false)
const { add: addToast } = useToast()

const genreOptions = [
  { label: '奇幻', value: 'fantasy' },
  { label: '悬疑', value: 'mystery' },
  { label: '科幻', value: 'sci-fi' },
  { label: '言情', value: 'romance' },
]

function simulateLoading() {
  loading.value = true
  setTimeout(() => {
    loading.value = false
    addToast('操作完成', 'success')
  }, 2000)
}

function showError() {
  inputError.value = '小说名称不能为空'
  addToast('请检查表单', 'error')
}

function clearError() {
  inputError.value = ''
}
</script>

<template>
  <NAppLayout project-name="设计系统预览">
    <template #nav>
      <nav class="flex flex-col gap-1 p-3">
        <p class="mb-2 text-xs text-text-muted font-medium">
          组件列表
        </p>
        <a
          href="#buttons"
          class="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-subtle"
        >
          按钮
        </a>
        <a
          href="#tags"
          class="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-subtle"
        >
          标签
        </a>
        <a
          href="#inputs"
          class="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-subtle"
        >
          表单
        </a>
        <a
          href="#panels"
          class="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-subtle"
        >
          面板
        </a>
        <a
          href="#states"
          class="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-subtle"
        >
          状态
        </a>
        <a
          href="#overlay"
          class="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-subtle"
        >
          弹层
        </a>
      </nav>
    </template>

    <div class="mx-auto max-w-4xl px-6 py-8 space-y-10">
      <header>
        <p class="text-sm text-primary font-medium">
          Phase 1
        </p>
        <h1 class="mt-1 text-2xl text-heading">
          设计系统组件预览
        </h1>
        <p class="mt-2 text-body">
          验证 token、基础组件和交互状态的视觉一致性。
        </p>
      </header>

      <!-- Buttons -->
      <section id="buttons">
        <h2 class="mb-4 text-lg text-heading">
          按钮 Button
        </h2>
        <NPanel title="按钮变体" description="5 种变体、3 种尺寸、loading 和 disabled 状态。">
          <div class="space-y-4">
            <div class="flex flex-wrap items-center gap-3">
              <NButton variant="primary">
                保存项目
              </NButton>
              <NButton variant="secondary">
                编辑设定
              </NButton>
              <NButton variant="ghost">
                取消
              </NButton>
              <NButton variant="ai">
                生成大纲
              </NButton>
              <NButton variant="danger">
                删除
              </NButton>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <NButton size="sm" variant="primary">
                小按钮
              </NButton>
              <NButton size="md" variant="primary">
                中按钮
              </NButton>
              <NButton size="lg" variant="primary">
                大按钮
              </NButton>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <NButton :loading="loading" variant="primary" @click="simulateLoading">
                {{ loading ? '生成中' : '模拟 Loading' }}
              </NButton>
              <NButton disabled variant="secondary">
                Disabled
              </NButton>
              <NIconButton label="保存" variant="ghost">
                <span class="i-lucide-save h-4 w-4" />
              </NIconButton>
              <NIconButton label="搜索" variant="ghost">
                <span class="i-lucide-search h-4 w-4" />
              </NIconButton>
              <NIconButton label="更多操作" variant="ghost">
                <span class="i-lucide-more-horizontal h-4 w-4" />
              </NIconButton>
            </div>
          </div>
        </NPanel>
      </section>

      <!-- Tags -->
      <section id="tags">
        <h2 class="mb-4 text-lg text-heading">
          标签 Tag
        </h2>
        <NPanel title="标签变体" description="用于状态、角色类型和 AI 标识。">
          <div class="flex flex-wrap gap-2">
            <NTag variant="default">
              默认
            </NTag>
            <NTag variant="primary">
              主角
            </NTag>
            <NTag variant="success">
              已保存
            </NTag>
            <NTag variant="warning">
              需要确认
            </NTag>
            <NTag variant="error">
              保存失败
            </NTag>
            <NTag variant="info">
              知识库引用
            </NTag>
            <NTag variant="ai">
              AI 生成
            </NTag>
            <NTag size="sm" variant="primary">
              小标签
            </NTag>
          </div>
        </NPanel>
      </section>

      <!-- Inputs -->
      <section id="inputs">
        <h2 class="mb-4 text-lg text-heading">
          表单控件
        </h2>
        <NPanel title="输入框、文本域和选择器" description="所有控件有 label、placeholder 和 error 状态。">
          <div class="grid gap-4 md:grid-cols-2">
            <NInput
              v-model="projectName"
              label="小说名称"
              placeholder="输入小说名称"
              :error="inputError"
              @focus="clearError"
            />
            <NSelect
              v-model="genre"
              label="题材"
              :options="genreOptions"
              placeholder="选择题材"
            />
          </div>
          <div class="mt-4">
            <NTextArea
              v-model="textareaValue"
              label="一句话创意"
              placeholder="例如：一座只在雨夜出现的城市，保存着所有未完成小说的人物。"
              :rows="3"
            />
          </div>
          <template #footer>
            <div class="flex gap-2">
              <NButton size="sm" variant="danger" @click="showError">
                触发错误
              </NButton>
              <NButton size="sm" variant="secondary" @click="addToast('表单已保存', 'success')">
                保存
              </NButton>
            </div>
          </template>
        </NPanel>
      </section>

      <!-- Panels -->
      <section id="panels">
        <h2 class="mb-4 text-lg text-heading">
          面板 Panel
        </h2>
        <div class="grid gap-4 md:grid-cols-2">
          <NPanel title="基础面板" description="带标题和描述。">
            <p class="text-body">
              面板用于承载功能区域，标题保持短句。
            </p>
          </NPanel>
          <NPanel title="带操作的面板">
            <p class="text-body">
              右上角可以放置操作按钮。
            </p>
            <template #actions>
              <NIconButton label="更多操作" variant="ghost">
                <span class="i-lucide-more-horizontal h-4 w-4" />
              </NIconButton>
            </template>
            <template #footer>
              <div class="flex justify-end gap-2">
                <NButton size="sm" variant="secondary">
                  取消
                </NButton>
                <NButton size="sm" variant="primary">
                  保存
                </NButton>
              </div>
            </template>
          </NPanel>
        </div>
      </section>

      <!-- States -->
      <section id="states">
        <h2 class="mb-4 text-lg text-heading">
          状态组件
        </h2>
        <div class="grid gap-4 md:grid-cols-3">
          <NEmptyState title="还没有人物" description="人物会帮助 AI 保持动机和对话一致。">
            <template #action>
              <NButton size="sm" variant="primary">
                创建人物
              </NButton>
            </template>
          </NEmptyState>
          <NLoadingState variant="card" />
          <NErrorState title="AI 生成失败" description="你的章节内容已保存。可以稍后重试。">
            <template #action>
              <NButton size="sm" variant="secondary" @click="addToast('正在重试...', 'info')">
                重试
              </NButton>
            </template>
          </NErrorState>
        </div>

        <h3 class="mb-3 mt-6 text-heading">
          加载态变体
        </h3>
        <div class="grid gap-4 md:grid-cols-2">
          <NPanel title="页面骨架">
            <NLoadingState variant="page" />
          </NPanel>
          <NPanel title="表格骨架">
            <NLoadingState variant="table" />
          </NPanel>
        </div>
      </section>

      <!-- Overlay -->
      <section id="overlay">
        <h2 class="mb-4 text-lg text-heading">
          弹层组件
        </h2>
        <NPanel title="抽屉、弹窗和提示">
          <div class="flex flex-wrap gap-3">
            <NButton variant="secondary" @click="drawerOpen = true">
              打开抽屉
            </NButton>
            <NButton variant="secondary" @click="modalOpen = true">
              打开弹窗
            </NButton>
            <NButton variant="secondary" @click="addToast('操作成功完成', 'success')">
              Success Toast
            </NButton>
            <NButton variant="secondary" @click="addToast('这是一条提示', 'info')">
              Info Toast
            </NButton>
            <NButton variant="secondary" @click="addToast('请注意检查', 'warning')">
              Warning Toast
            </NButton>
            <NButton variant="secondary" @click="addToast('连接失败，请重试', 'error')">
              Error Toast
            </NButton>
          </div>
        </NPanel>
      </section>
    </div>

    <template #context>
      <div class="p-4">
        <h3 class="mb-3 text-heading">
          右侧上下文
        </h3>
        <p class="text-body">
          这是三栏布局的右侧面板，用于展示写作上下文。
        </p>
        <div class="mt-4 space-y-2">
          <NTag variant="info">
            知识库引用
          </NTag>
          <NTag variant="ai">
            AI 建议
          </NTag>
        </div>
      </div>
    </template>
  </NAppLayout>

  <NDrawer v-model="drawerOpen" title="章节上下文">
    <div class="text-sm text-text-secondary space-y-4">
      <p>本章目标：让主角第一次进入镜中城。</p>
      <p>核心冲突：主角想找到失踪作者，城门守卫拒绝承认现实世界存在。</p>
      <p>伏笔：旧铜钥匙第一次发热。</p>
      <NButton variant="secondary" @click="drawerOpen = false">
        关闭
      </NButton>
    </div>
  </NDrawer>

  <NModal v-model="modalOpen" title="确认生成章节大纲">
    <p class="text-body leading-6">
      系统将参考故事圣经、人物设定和当前分卷目标生成本章大纲。生成结果会进入确认区，不会自动覆盖已有内容。
    </p>
    <template #footer>
      <div class="flex justify-end gap-2">
        <NButton variant="secondary" @click="modalOpen = false">
          取消
        </NButton>
        <NButton variant="ai" @click="modalOpen = false; addToast('正在生成...', 'info')">
          开始生成
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style>
/* Inline toast render since NToast is a separate component */
</style>
