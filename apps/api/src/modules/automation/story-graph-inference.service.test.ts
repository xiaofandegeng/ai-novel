import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runGraphInference } from './story-graph-inference.service'

const graphMocks = vi.hoisted(() => ({
  rows: [] as unknown[][],
  createSuggestion: vi.fn(),
}))

vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(graphMocks.rows.shift() ?? []),
      }),
    }),
  },
}))

vi.mock('./postprocess-suggestion.service', () => ({
  createSuggestion: graphMocks.createSuggestion,
}))

describe('story graph inference', () => {
  beforeEach(() => {
    graphMocks.rows = []
    graphMocks.createSuggestion.mockReset().mockResolvedValue({ id: 'suggestion-1' })
  })

  it('derives relationships, transitive facts, conflict escalation, and foreshadowing payoff', async () => {
    const triples = [
      {
        id: 'triple-1',
        subjectType: 'character',
        subjectName: '林岚',
        predicate: '认识',
        objectType: 'character',
        objectName: '周砚',
        sourceChapterId: 'chapter-1',
      },
      {
        id: 'triple-2',
        subjectType: 'character',
        subjectName: '周砚',
        predicate: '追踪',
        objectType: 'character',
        objectName: '沈渡',
        sourceChapterId: 'chapter-2',
      },
      {
        id: 'triple-3',
        subjectType: 'character',
        subjectName: '林岚',
        predicate: '攻击',
        objectType: 'character',
        objectName: '沈渡',
        sourceChapterId: 'chapter-3',
      },
    ]
    const elements = [
      { id: 'element-1', chapterId: 'chapter-1', elementType: 'character', relationType: 'appears', elementId: 'character-1', elementName: '林岚' },
      { id: 'element-2', chapterId: 'chapter-1', elementType: 'character', relationType: 'appears', elementId: 'character-2', elementName: '周砚' },
      { id: 'element-duplicate', chapterId: 'chapter-1', elementType: 'character', relationType: 'appears', elementId: 'character-1', elementName: '林岚' },
      { id: 'ignored', chapterId: 'chapter-1', elementType: 'location', relationType: 'appears', elementName: '雾港' },
    ]
    const conflicts = [{
      id: 'conflict-1',
      title: '林岚与沈渡的对抗',
      participants: '林岚,沈渡',
      status: 'active',
      intensity: 10,
    }]
    const foreshadowing = [{
      id: 'foreshadowing-1',
      title: '林岚留下的旧钥匙',
      description: '等待真相揭晓',
      status: 'open',
    }]
    graphMocks.rows = [
      triples,
      elements,
      [],
      conflicts,
      foreshadowing,
      [{ payload: '{malformed' }, { payload: JSON.stringify({ inferenceKey: 'unrelated:existing' }) }],
    ]

    await expect(runGraphInference('project-1')).resolves.toBe(5)
    expect(graphMocks.createSuggestion).toHaveBeenCalledTimes(5)
    expect(graphMocks.createSuggestion.mock.calls.map(call => call[3])).toEqual([
      'relationship_update',
      'fact_triple',
      'conflict_update',
      'foreshadowing_payoff',
      'foreshadowing_payoff',
    ])
    expect(graphMocks.createSuggestion.mock.calls[2][4]).toMatchObject({ newIntensity: 10 })
  })

  it('deduplicates existing relationships and inferences and ignores facts without source chapters', async () => {
    const triples = [
      {
        id: 'triple-a',
        subjectType: 'character',
        subjectName: '甲',
        predicate: '认识',
        objectType: 'character',
        objectName: '乙',
        sourceChapterId: null,
      },
      {
        id: 'triple-b',
        subjectType: 'character',
        subjectName: '乙',
        predicate: '认识',
        objectType: 'character',
        objectName: '丙',
        sourceChapterId: null,
      },
    ]
    graphMocks.rows = [
      triples,
      [
        { id: 'e1', chapterId: 'chapter-1', elementType: 'character', relationType: 'appears', elementId: 'a', elementName: '甲' },
        { id: 'e2', chapterId: 'chapter-1', elementType: 'character', relationType: 'appears', elementId: 'b', elementName: '乙' },
      ],
      [{ characterAId: 'a', characterBId: 'b' }],
      [],
      [],
      [{ payload: JSON.stringify({ inferenceKey: 'transitive:triple-a:triple-b:甲:丙' }) }],
    ]

    await expect(runGraphInference('project-1')).resolves.toBe(0)
    expect(graphMocks.createSuggestion).not.toHaveBeenCalled()
  })
})
