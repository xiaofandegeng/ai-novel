import type { AIProviderPreset } from '@ai-novel/shared'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import ProjectAIProviderSettings from './project-ai-provider-settings.vue'
import ProjectExportPanel from './project-export-panel.vue'

const exportMocks = vi.hoisted(() => ({
  exportCharacterProfiles: vi.fn(),
  exportConflictReport: vi.fn(),
  exportForeshadowingReport: vi.fn(),
  exportManuscript: vi.fn(),
  exportProposal: vi.fn(),
}))

vi.mock('../api/export.api', () => exportMocks)

const provider: AIProviderPreset = {
  id: 'openai-compatible',
  label: '兼容服务',
  description: 'OpenAI 兼容服务',
  baseUrl: 'https://example.com/v1',
  defaultModel: 'novel-model',
  defaultEmbeddingModel: 'embedding-model',
  apiKeyHint: '填写服务密钥',
  models: [{ label: 'Novel Model', value: 'novel-model' }],
  requiresCustomModel: true,
}

describe('project settings panels', () => {
  beforeEach(() => {
    Object.values(exportMocks).forEach(mock => mock.mockReset().mockResolvedValue(undefined))
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('edits both providers and exposes save and connectivity actions', async () => {
    const model = ref({
      provider: 'openai-compatible',
      baseUrl: provider.baseUrl,
      model: provider.defaultModel,
      apiKey: '',
      temperature: '70',
      hasApiKey: false,
      embeddingProvider: 'openai-compatible',
      embeddingBaseUrl: provider.baseUrl,
      embeddingModel: provider.defaultEmbeddingModel!,
      embeddingApiKey: '',
      hasEmbeddingApiKey: false,
      embeddingEnabled: true,
    })
    const wrapper = mount(ProjectAIProviderSettings, {
      props: {
        'modelValue': model.value,
        'saving': false,
        'testing': false,
        'embeddingTesting': false,
        'aiTestMessage': '连接正常',
        'embeddingTestMessage': '1536 维',
        'aiProviderOptions': [{ label: provider.label, value: provider.id }],
        'currentAIProviderPreset': provider,
        'currentEmbeddingProviderPreset': provider,
        'aiModelOptions': provider.models,
        'embeddingModelOptions': [{ label: 'Embedding', value: provider.defaultEmbeddingModel! }],
        'aiProviderModel': provider.id,
        'embeddingProviderModel': provider.id,
        'aiModelSelectModel': provider.defaultModel,
        'embeddingModelSelectModel': provider.defaultEmbeddingModel!,
        'onUpdate:modelValue': (value: typeof model.value) => (model.value = value),
      },
    })

    expect(wrapper.text()).toContain('该服务的模型名可能需要填写')
    expect(wrapper.text()).toContain('请先配置 API Key')
    expect(wrapper.text()).toContain('1536 维')

    const selects = wrapper.findAll('select')
    await selects[0].setValue('openai-compatible')
    await selects[1].setValue('novel-model')
    await selects[2].setValue('openai-compatible')
    await selects[3].setValue('embedding-model')

    for (const label of ['测试向量化', '检测可用性', '保存 AI 配置']) {
      await wrapper.findAll('button').find(button => button.text().includes(label))!.trigger('click')
    }

    expect(wrapper.emitted('update:aiProviderModel')).toBeTruthy()
    expect(wrapper.emitted('update:aiModelSelectModel')).toBeTruthy()
    expect(wrapper.emitted('update:embeddingProviderModel')).toBeTruthy()
    expect(wrapper.emitted('update:embeddingModelSelectModel')).toBeTruthy()
    expect(wrapper.emitted('testEmbedding')).toHaveLength(1)
    expect(wrapper.emitted('test')).toHaveLength(1)
    expect(wrapper.emitted('save')).toHaveLength(1)

    await wrapper.find('input[type="checkbox"]').setValue(false)
    expect(wrapper.text()).toContain('向量化功能已禁用')
  })

  it('exports a configured manuscript and every specialist report', async () => {
    const wrapper = mount(ProjectExportPanel, {
      props: { projectId: 'project-1', projectTitle: '雾港' },
    })

    await wrapper.findAll('button').find(button => button.text().includes('纯文本'))!.trigger('click')
    const toggles = wrapper.findAll('input[type="checkbox"]')
    await toggles[0].setValue(true)
    await toggles[2].setValue(true)
    await toggles[3].setValue(true)
    await wrapper.findAll('button').find(button => button.text().includes('导出手稿'))!.trigger('click')
    await flushPromises()

    expect(exportMocks.exportManuscript).toHaveBeenCalledWith('project-1', {
      format: 'txt',
      includeOutline: true,
      includeScenes: true,
      includeUnfinishedChapters: true,
      includeAuthorNotes: true,
    })

    for (const button of wrapper.findAll('button').filter(candidate => candidate.text() === '导出')) {
      await button.trigger('click')
      await flushPromises()
    }
    expect(exportMocks.exportProposal).toHaveBeenCalledWith('project-1')
    expect(exportMocks.exportCharacterProfiles).toHaveBeenCalledWith('project-1')
    expect(exportMocks.exportForeshadowingReport).toHaveBeenCalledWith('project-1')
    expect(exportMocks.exportConflictReport).toHaveBeenCalledWith('project-1')
  })

  it('releases the export lock after a failed download so the author can retry', async () => {
    exportMocks.exportProposal.mockRejectedValueOnce(new Error('network down'))
    const wrapper = mount(ProjectExportPanel, {
      props: { projectId: 'project-1', projectTitle: '雾港' },
    })
    const quickButton = wrapper.findAll('button').find(button => button.text() === '导出')!

    await quickButton.trigger('click')
    await flushPromises()
    expect(exportMocks.exportProposal).toHaveBeenCalledTimes(1)
    expect(quickButton.attributes('disabled')).toBeUndefined()
  })
})
