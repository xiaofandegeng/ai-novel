import type {
  CockpitCharacterState,
  CockpitConflictState,
  CockpitForeshadowingState,
  CockpitRelationshipState,
} from '@ai-novel/shared'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import ChapterPipelinePanel from './chapter-pipeline-panel.vue'
import CockpitHeader from './cockpit-header.vue'
import NarrativeStateBoard from './narrative-state-board.vue'

const character: CockpitCharacterState = {
  id: 'character-1',
  name: '林岚',
  role: 'protagonist',
  emotion: '警觉',
  goal: '查清港口失踪案',
}
const relationship: CockpitRelationshipState = {
  id: 'relationship-1',
  sourceCharacterId: 'character-1',
  targetCharacterId: 'character-2',
  sourceName: '林岚',
  targetName: '周砚',
  type: '互不信任的搭档',
  trust: 35,
  conflict: 70,
}
const conflict: CockpitConflictState = {
  id: 'conflict-1',
  title: '港口封锁',
  type: 'external',
  intensity: 8,
  status: 'escalating',
}
const foreshadowing: CockpitForeshadowingState = {
  id: 'foreshadowing-1',
  title: '生锈的旧钥匙',
  status: 'open',
  importance: 'major',
}

describe('cockpit information panels', () => {
  it('renders the project header and emits refresh', async () => {
    const wrapper = mount(CockpitHeader, {
      props: {
        project: { id: 'project-1', title: '雾港', genre: '悬疑', currentWordCount: 12000, targetWordCount: 100000 },
        loading: false,
      },
    })
    expect(wrapper.text()).toContain('雾港')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('expands chapter steps and emits chapter detail navigation', async () => {
    const wrapper = mount(ChapterPipelinePanel, {
      props: {
        chapters: [{
          id: 'chapter-1',
          title: '归港',
          orderIndex: 1,
          status: 'running',
          wordCount: 800,
          steps: [
            { key: 'draft', label: '生成正文', status: 'running' },
            { key: 'review', label: '人工复核', status: 'skipped', finishedAt: '2026-08-11T08:00:00.000Z' },
          ],
        }],
      },
    })
    await wrapper.get('.chapter-card-header').trigger('click')
    expect(wrapper.text()).toContain('生成正文')
    expect(wrapper.text()).toContain('已略过')
    expect(wrapper.find('.step-status-skipped').exists()).toBe(true)
    await wrapper.findAll('button').find(button => button.text().includes('详情'))!.trigger('click')
    expect(wrapper.emitted('chapterClick')).toEqual([['chapter-1']])
  })

  it('switches across every narrative state panel with representative data', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/project/:id', component: { template: '<div />' } }],
    })
    await router.push('/project/project-1')
    await router.isReady()
    const wrapper = mount(NarrativeStateBoard, {
      global: { plugins: [router] },
      props: {
        characters: [character],
        relationships: [relationship],
        conflicts: [conflict],
        foreshadowing: [foreshadowing],
        plotDirection: {
          themeProgress: '信任主题进入反转阶段',
          nextChapterGoal: '潜入封锁仓库',
          suggestions: ['让旧钥匙打开内仓'],
        },
        health: {
          overallScore: 68,
          riskCount: 1,
          details: [{ scope: '第 1 章', riskLevel: 'medium', description: '场景目标不清晰' }],
        },
      },
    })

    expect(wrapper.text()).toContain('林岚')
    const expectedByTab = new Map([
      ['关系动态', '互不信任的搭档'],
      ['矛盾冲突', '港口封锁'],
      ['伏笔台账', '生锈的旧钥匙'],
      ['走向建议', '潜入封锁仓库'],
      ['风险预警', '场景目标不清晰'],
    ])
    for (const [tab, expected] of expectedByTab) {
      await wrapper.findAll('button').find(button => button.text().includes(tab))!.trigger('click')
      expect(wrapper.text()).toContain(expected)
    }
    expect(wrapper.emitted('update:activeTab')).toHaveLength(5)
  })
})
