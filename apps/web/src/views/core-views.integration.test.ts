import type { NovelProject } from '@ai-novel/shared'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import AutomationCockpitView from './automation-cockpit-view.vue'
import ProjectListView from './project-list-view.vue'
import ProjectSettingsView from './project-settings-view.vue'

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  route: { params: { id: 'project-1' }, query: {} as Record<string, string> },
}))

const projectApiMocks = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  fetchProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

const exportApiMocks = vi.hoisted(() => ({
  exportProject: vi.fn(),
  exportManuscript: vi.fn(),
  exportProposal: vi.fn(),
  exportCharacterProfiles: vi.fn(),
  exportForeshadowingReport: vi.fn(),
  exportConflictReport: vi.fn(),
}))

const cockpitMocks = vi.hoisted(() => ({
  loadCockpit: vi.fn(),
  loadChapter: vi.fn(),
  startRun: vi.fn(),
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  abandonRun: vi.fn(),
  approveItem: vi.fn(),
  rejectItem: vi.fn(),
  resolveException: vi.fn(),
  polling: vi.fn(),
}))

const chapterApiMocks = vi.hoisted(() => ({
  fetchChapters: vi.fn(),
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  deleteChapter: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => routerMocks.route,
  useRouter: () => ({ push: routerMocks.push }),
  RouterLink: defineComponent({
    props: { to: { type: [String, Object], required: true } },
    template: '<a><slot /></a>',
  }),
  RouterView: defineComponent({ template: '<main data-testid="router-view" />' }),
}))

vi.mock('@/features/projects/api/projects.api', () => projectApiMocks)
vi.mock('@/features/settings/api/export.api', () => exportApiMocks)
vi.mock('@/features/automation-cockpit/api/chapters.api', () => chapterApiMocks)

vi.mock('@/features/automation-cockpit/composables/useAutomationCockpit', () => ({
  useAutomationCockpit: () => ({
    project: { id: 'project-1', title: '雾港', currentWordCount: 3000 },
    run: { id: 'run-1', status: 'running', strategy: 'balanced', targetChapterCount: 3, completedChapterCount: 1 },
    chapters: [{ id: 'chapter-1', chapterNumber: 1, title: '归港', status: 'completed' }],
    characters: [],
    relationships: [],
    conflicts: [],
    foreshadowing: [],
    plotDirection: {},
    health: { overallScore: 90, riskCount: 1 },
    events: [],
    exceptions: [],
    chapterDetail: null,
    loadCockpit: cockpitMocks.loadCockpit,
    loadChapter: cockpitMocks.loadChapter,
    startRun: cockpitMocks.startRun,
    pauseRun: cockpitMocks.pauseRun,
    resumeRun: cockpitMocks.resumeRun,
    abandonRun: cockpitMocks.abandonRun,
    approveItem: cockpitMocks.approveItem,
    rejectItem: cockpitMocks.rejectItem,
    resolveException: cockpitMocks.resolveException,
  }),
}))

vi.mock('@/features/automation-cockpit/composables/useCockpitPolling', () => ({
  useCockpitPolling: cockpitMocks.polling,
}))

const project: NovelProject = {
  id: 'project-1',
  title: '雾港',
  description: '一座记忆会消失的港口',
  genre: '悬疑',
  theme: '记忆与选择',
  targetWords: 120000,
  status: 'writing',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: new Date().toISOString(),
}

const aiSettingsState = {
  aiForm: ref({
    provider: 'openai-compatible',
    baseUrl: 'https://example.com/v1',
    model: 'novel-model',
    apiKey: '',
    temperature: '70',
    hasApiKey: true,
    embeddingProvider: 'openai-compatible',
    embeddingBaseUrl: 'https://example.com/v1',
    embeddingModel: 'embedding-model',
    embeddingApiKey: '',
    hasEmbeddingApiKey: true,
    embeddingEnabled: true,
  }),
  saving: ref(false),
  testing: ref(false),
  embeddingTesting: ref(false),
  aiTestMessage: ref(''),
  embeddingTestMessage: ref(''),
  aiProviderOptions: ref([{ label: '兼容服务', value: 'openai-compatible' }]),
  currentAIProviderPreset: ref(undefined),
  currentEmbeddingProviderPreset: ref(undefined),
  aiModelOptions: ref([{ label: 'Novel', value: 'novel-model' }]),
  embeddingModelOptions: ref([{ label: 'Embedding', value: 'embedding-model' }]),
  aiProviderModel: ref('openai-compatible'),
  embeddingProviderModel: ref('openai-compatible'),
  aiModelSelectModel: ref('novel-model'),
  embeddingModelSelectModel: ref('embedding-model'),
  handleSaveAI: vi.fn(),
  handleTestAI: vi.fn(),
  handleTestEmbedding: vi.fn(),
}

vi.mock('@/features/settings/composables/useAIProviderSettings', () => ({
  useAIProviderSettings: () => aiSettingsState,
}))

function findButton(text: string) {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button.textContent?.includes(text))
}

describe('core route views', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    routerMocks.push.mockReset()
    for (const mock of [
      ...Object.values(projectApiMocks),
      ...Object.values(exportApiMocks),
      ...Object.values(cockpitMocks),
      ...Object.values(chapterApiMocks),
      aiSettingsState.handleSaveAI,
      aiSettingsState.handleTestAI,
      aiSettingsState.handleTestEmbedding,
    ]) {
      mock.mockReset().mockResolvedValue(undefined)
    }
    projectApiMocks.fetchProject.mockResolvedValue(project)
    projectApiMocks.updateProject.mockResolvedValue(project)
    projectApiMocks.createProject.mockResolvedValue({ ...project, id: 'project-new', title: '星火' })
    exportApiMocks.exportProject.mockResolvedValue(undefined)
    chapterApiMocks.updateChapter.mockResolvedValue({
      id: 'chapter-1',
      projectId: 'project-1',
      chapterNumber: 1,
      title: '归港',
      draft: '新正文',
      status: 'writing',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads, filters, creates, paginates, and deletes projects through the real store', async () => {
    const firstPage = Array.from({ length: 12 }, (_, index) => ({
      ...project,
      id: `project-${index + 1}`,
      title: index === 0 ? '雾港' : `作品 ${index + 1}`,
    }))
    projectApiMocks.fetchProjects
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ ...project, id: 'project-13', title: '远航' }])
    const wrapper = mount(ProjectListView, {
      attachTo: document.body,
      global: {
        components: {
          RouterLink: defineComponent({
            props: { to: { type: [String, Object], required: true } },
            template: '<a><slot /></a>',
          }),
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('雾港')
    expect(wrapper.text()).toContain('120,000')
    await wrapper.find('#project-search').setValue('不存在')
    expect(wrapper.text()).toContain('暂无项目')
    await wrapper.find('#project-search').setValue('')

    await wrapper.findAll('button').find(button => button.text().includes('加载更多项目'))!.trigger('click')
    await flushPromises()
    expect(projectApiMocks.fetchProjects).toHaveBeenLastCalledWith({ limit: 12, offset: 12 })
    expect(wrapper.text()).toContain('远航')

    await wrapper.findAll('button').find(button => button.text().includes('创建新项目'))!.trigger('click')
    await findButton('开始创作')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('项目名称不能为空')
    const titleInput = Array.from(document.body.querySelectorAll<HTMLInputElement>('input'))
      .find(input => input.placeholder.includes('小说标题'))!
    titleInput.value = '星火'
    titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    await findButton('开始创作')!.click()
    await flushPromises()
    expect(projectApiMocks.createProject).toHaveBeenCalledWith(expect.objectContaining({ title: '星火' }))
    expect(routerMocks.push).toHaveBeenCalledWith('/project/project-new')

    await wrapper.find('button[aria-label="删除项目"]').trigger('click')
    await findButton('确认删除')!.click()
    await flushPromises()
    expect(projectApiMocks.deleteProject).toHaveBeenCalledWith('project-1')
  })

  it('saves, exports, configures AI, and confirms project deletion', async () => {
    const wrapper = mount(ProjectSettingsView, {
      attachTo: document.body,
      global: { stubs: { AIPromptSettings: { template: '<div>提示词设置</div>' } } },
    })
    await flushPromises()

    expect(wrapper.find('input[placeholder="输入作品名称"]').element).toHaveProperty('value', '雾港')
    await wrapper.findAll('button').find(button => button.text().includes('保存更改'))!.trigger('click')
    await wrapper.findAll('button').find(button => button.text().includes('导出完整备份'))!.trigger('click')
    await flushPromises()
    expect(projectApiMocks.updateProject).toHaveBeenCalledWith('project-1', expect.objectContaining({ title: '雾港' }))
    expect(exportApiMocks.exportProject).toHaveBeenCalledWith('project-1')

    await wrapper.findAll('button').find(button => button.text().includes('AI 提示词与结构'))!.trigger('click')
    expect(wrapper.text()).toContain('提示词设置')
    await wrapper.findAll('button').find(button => button.text().includes('AI 模型服务'))!.trigger('click')
    for (const label of ['检测可用性', '测试向量化', '保存 AI 配置']) {
      await wrapper.findAll('button').find(button => button.text().includes(label))!.trigger('click')
    }
    expect(aiSettingsState.handleTestAI).toHaveBeenCalledTimes(1)
    expect(aiSettingsState.handleTestEmbedding).toHaveBeenCalledTimes(1)
    expect(aiSettingsState.handleSaveAI).toHaveBeenCalledTimes(1)

    await wrapper.findAll('button').find(button => button.text().includes('常规设置'))!.trigger('click')
    await wrapper.findAll('button').find(button => button.text().includes('删除项目'))!.trigger('click')
    await findButton('确认删除')!.click()
    await flushPromises()
    expect(projectApiMocks.deleteProject).toHaveBeenCalledWith('project-1')
    expect(routerMocks.push).toHaveBeenCalledWith('/')
  })

  it('wires every cockpit command, review action, exception decision, and chapter save', async () => {
    const controlStub = defineComponent({
      emits: ['start', 'pause', 'resume', 'abandon'],
      template: `<div>
        <button @click="$emit('start', { strategy: 'balanced' })">start</button>
        <button @click="$emit('pause')">pause</button>
        <button @click="$emit('resume')">resume</button>
        <button @click="$emit('abandon')">abandon</button>
      </div>`,
    })
    const wrapper = mount(AutomationCockpitView, {
      attachTo: document.body,
      global: {
        stubs: {
          CockpitHeader: defineComponent({ emits: ['refresh'], template: '<button @click="$emit(\'refresh\')">refresh</button>' }),
          AutomationControlPanel: controlStub,
          ChapterPipelinePanel: defineComponent({ emits: ['chapterClick'], template: '<button @click="$emit(\'chapterClick\', \'chapter-1\')">chapter</button>' }),
          ExceptionCenterPanel: defineComponent({ emits: ['action'], template: '<button @click="$emit(\'action\', \'exception-1\', \'retry_step\')">exception</button>' }),
          NarrativeEventStream: defineComponent({ emits: ['approve', 'reject'], template: '<div><button @click="$emit(\'approve\', \'event-1\', \'change-1\')">approve</button><button @click="$emit(\'reject\', \'event-1\', \'change-1\')">reject</button></div>' }),
          NarrativeStateBoard: defineComponent({ emits: ['refresh'], template: '<button @click="$emit(\'refresh\')">board</button>' }),
          ChapterDetailDrawer: defineComponent({ emits: ['save'], template: '<button @click="$emit(\'save\', \'新正文\')">save chapter</button>' }),
        },
      },
    })
    await flushPromises()
    for (const label of ['start', 'pause', 'resume', 'abandon', 'refresh', 'chapter', 'approve', 'reject', 'exception', 'save chapter']) {
      await wrapper.findAll('button').find(button => button.text() === label)!.trigger('click')
      await flushPromises()
    }

    expect(cockpitMocks.loadCockpit).toHaveBeenCalled()
    expect(cockpitMocks.loadChapter).toHaveBeenCalledWith('chapter-1')
    expect(cockpitMocks.startRun).toHaveBeenCalledWith({ strategy: 'balanced' })
    expect(cockpitMocks.pauseRun).toHaveBeenCalledTimes(1)
    expect(cockpitMocks.resumeRun).toHaveBeenCalledTimes(1)
    expect(cockpitMocks.abandonRun).toHaveBeenCalledTimes(1)
    expect(cockpitMocks.approveItem).toHaveBeenCalledWith('change-1', 'event-1')
    expect(cockpitMocks.rejectItem).toHaveBeenCalledWith('change-1', 'event-1')
    expect(cockpitMocks.resolveException).toHaveBeenCalledWith('exception-1', 'retry_step')
    expect(chapterApiMocks.updateChapter).toHaveBeenCalledWith('project-1', 'chapter-1', { draft: '新正文' })
  })
})
