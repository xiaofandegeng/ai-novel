import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AIPromptSettings from './ai-prompt-settings.vue'

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ success: true, data })))
}

describe('ai prompt settings', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads the first selected template existing project override into the editor', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/prompt-templates') {
        return response([{
          id: 'template-1',
          key: 'draft_generate',
          name: '正文生成',
          description: '生成正文',
          version: '1.0.0',
          systemPrompt: '默认系统提示',
          userPromptTemplate: '默认用户提示',
          outputSchema: null,
        }])
      }
      if (url === '/api/projects/project-1/prompt-overrides') {
        return response([{
          id: 'override-1',
          projectId: 'project-1',
          templateKey: 'draft_generate',
          overrideSystemPrompt: '已保存系统覆盖',
          overrideUserPromptTemplate: '已保存用户覆盖',
          enabled: 1,
        }])
      }
      if (url === '/api/story-structure/templates')
        return response([])
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(AIPromptSettings, {
      props: { projectId: 'project-1' },
    })
    await flushPromises()

    const editors = wrapper.findAll('textarea')
    expect((editors[0].element as HTMLTextAreaElement).value).toBe('已保存系统覆盖')
    expect((editors[1].element as HTMLTextAreaElement).value).toBe('已保存用户覆盖')
    wrapper.unmount()
  })
})
