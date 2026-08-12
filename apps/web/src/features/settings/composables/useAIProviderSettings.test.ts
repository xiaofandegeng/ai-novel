import type { AIProviderPreset, AIProviderSettings } from '@ai-novel/shared'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useAIProviderSettings } from './useAIProviderSettings'

const provider: AIProviderPreset = {
  id: 'openai',
  label: 'OpenAI',
  description: '官方接口',
  baseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-test',
  defaultEmbeddingModel: 'embedding-test',
  apiKeyHint: 'key',
  models: [{ label: 'GPT Test', value: 'gpt-test' }],
}
const settings: AIProviderSettings = {
  provider: 'openai',
  baseUrl: provider.baseUrl,
  model: provider.defaultModel,
  temperature: 70,
  hasApiKey: true,
  embeddingProvider: 'openai',
  embeddingBaseUrl: provider.baseUrl,
  embeddingModel: provider.defaultEmbeddingModel,
  hasEmbeddingApiKey: false,
  embeddingEnabled: true,
}

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ success: true, data })))
}

describe('ai provider settings composable', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads settings, applies provider defaults, saves, and tests both providers', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/settings/ai/providers')
        return response([provider])
      if (url === '/api/projects/project-1/settings/ai' && options?.method === 'PUT')
        return response({ ...settings, hasEmbeddingApiKey: true })
      if (url === '/api/projects/project-1/settings/ai/test')
        return response({ ok: true, message: '连接正常', latencyMs: 25 })
      if (url === '/api/projects/project-1/settings/ai/test-embedding')
        return response({ ok: true, message: '向量正常', dimensions: 1536 })
      return response(settings)
    })
    vi.stubGlobal('fetch', fetchMock)
    let state!: ReturnType<typeof useAIProviderSettings>
    const wrapper = mount(defineComponent({
      setup() {
        state = useAIProviderSettings('project-1')
        return () => null
      },
    }))
    await flushPromises()

    expect(state.loaded.value).toBe(true)
    expect(state.aiProviderOptions.value).toEqual([{ label: 'OpenAI', value: 'openai' }])
    state.aiForm.value.apiKey = 'new-key'
    state.aiForm.value.embeddingApiKey = 'new-embedding-key'
    await state.handleSaveAI()
    expect(state.aiForm.value.apiKey).toBe('')
    expect(state.aiForm.value.hasEmbeddingApiKey).toBe(true)

    await state.handleTestAI()
    await state.handleTestEmbedding()
    expect(state.aiTestMessage.value).toContain('25ms')
    expect(state.embeddingTestMessage.value).toContain('1536')
    expect(fetchMock).toHaveBeenCalledTimes(5)
    wrapper.unmount()
  })
})
