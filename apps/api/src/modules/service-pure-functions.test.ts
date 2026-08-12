import type { BuiltAIContext } from '@ai-novel/shared'
import { describe, expect, it } from 'vitest'
import { renderAIContext } from './ai/ai-context-renderer'
import { estimateTokens } from './ai/ai-context-snapshot.service'
import { AIConfigurationError, AIParseError, sanitizeAISettings } from './ai/ai.service'
import { PromptTemplateService } from './ai/prompt-template.service'
import { normalizeCharacterPair } from './character/character-utils.service'

function baseContext(): BuiltAIContext {
  return {
    scene: 'draft',
    task: '续写下一场冲突',
    project: { title: '雾港', genre: '悬疑', theme: '信任' },
    characters: [],
    relationships: [],
    conflicts: [],
    knowledgeSnippets: [],
    chapterMemories: [],
    chapterElements: [],
    foreshadowingItems: [],
    factTriples: [],
    constraints: ['不得改变凶手身份'],
  }
}

describe('pure service boundaries', () => {
  it('renders the mandatory project, task, and constraint sections', () => {
    const rendered = renderAIContext(baseContext())

    expect(rendered).toContain('【本次任务】')
    expect(rendered).toContain('书名: 雾港')
    expect(rendered).toContain('主题: 信任')
    expect(rendered).toContain('- 不得改变凶手身份')
    expect(rendered).not.toContain('【人物关系】')
  })

  it('renders global guardrails and major-character emphasis without copying absent sections', () => {
    const context = baseContext()
    context.globalControl = {
      themeGuardrails: ['围绕信任推进'],
      plotDirection: ['调查进入港区'],
      characterGuardrails: ['林岚不会主动泄密'],
      relationshipGuardrails: [],
      conflictGuardrails: [],
      foreshadowingGuardrails: ['保留旧钥匙'],
      healthWarnings: [],
    }
    context.characters = [{ id: 'c1', name: '林岚', role: '调查员', isMajor: true }]

    const rendered = renderAIContext(context)
    expect(rendered).toContain('【全局剧情控制台】')
    expect(rendered).toContain('★ 林岚 (本章核心角色')
    expect(rendered).toContain('硬性原则')
    expect(rendered).not.toContain('当前健康风险:')
  })

  it('renders prompt variables while preserving unknown placeholders', () => {
    expect(PromptTemplateService.render('写作 {{ title }}，目标 {{words}} 字，{{missing}}', {
      title: '雾港',
      words: 3000,
    })).toBe('写作 雾港，目标 3000 字，{{missing}}')
  })

  it('estimates tokens and normalizes undirected character pairs deterministically', () => {
    expect(estimateTokens('12345678')).toBe(2)
    expect(estimateTokens('风雨雷电')).toBe(2)
    expect(estimateTokens('风雨1234')).toBe(2)
    expect(estimateTokens('')).toBe(0)
    expect(normalizeCharacterPair('character-b', 'character-a')).toEqual(['character-a', 'character-b'])
    expect(normalizeCharacterPair('character-a', 'character-b')).toEqual(['character-a', 'character-b'])
  })

  it('sanitizes provider settings without exposing credentials', () => {
    const sanitized = sanitizeAISettings({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-test',
      apiKey: 'secret-chat-key',
      temperature: 65,
      embeddingProvider: 'openai',
      embeddingBaseUrl: 'https://api.openai.com/v1',
      embeddingModel: 'text-embedding-test',
      embeddingApiKey: 'secret-embedding-key',
      embeddingEnabled: false,
      updatedAt: '2026-08-11T00:00:00.000Z',
    })

    expect(sanitized).toMatchObject({ hasApiKey: true, hasEmbeddingApiKey: true, embeddingEnabled: false })
    expect(sanitized).not.toHaveProperty('apiKey')
    expect(sanitized).not.toHaveProperty('embeddingApiKey')
  })

  it('preserves typed AI error metadata', () => {
    expect(new AIConfigurationError('missing key')).toMatchObject({ name: 'AIConfigurationError', code: 'CONFIG_ERROR' })
    expect(new AIParseError('bad json', '```oops```')).toMatchObject({
      name: 'AIParseError',
      code: 'PARSE_ERROR',
      rawContent: '```oops```',
    })
  })
})
