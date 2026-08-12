import type { CockpitChapterDetail, CockpitNarrativeEvent, CockpitRunSummary } from '@ai-novel/shared'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import AutomationControlPanel from './automation-control-panel.vue'
import ChapterDetailDrawer from './chapter-detail-drawer.vue'
import CharacterEmotionPanel from './character-emotion-panel.vue'
import ExceptionCenterPanel from './exception-center-panel.vue'
import NarrativeEventStream from './narrative-event-stream.vue'

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('cockpit component contracts', () => {
  it('emits the default run scope when the author starts automation', async () => {
    const wrapper = mount(AutomationControlPanel, { props: { run: null, loading: false } })
    await wrapper.findAll('button').find(button => button.text().includes('开启全自动写作任务'))!.trigger('click')

    expect(wrapper.emitted('start')).toEqual([[{
      strategy: 'balanced',
      scopeType: 'continue_incomplete',
      targetWordsPerChapter: 3000,
    }]])
  })

  it('exposes pause and abandon controls for an active run', async () => {
    const run: CockpitRunSummary = {
      id: 'run-1',
      status: 'running',
      strategy: 'safe',
      targetChapterCount: 3,
      completedChapterCount: 1,
    }
    const wrapper = mount(AutomationControlPanel, { props: { run, loading: false } })
    const buttons = wrapper.findAll('button')

    await buttons.find(button => button.text().includes('暂停运行'))!.trigger('click')
    await buttons.find(button => button.text().includes('放弃本次任务'))!.trigger('click')
    expect(wrapper.emitted('pause')).toHaveLength(1)
    expect(wrapper.emitted('abandon')).toHaveLength(1)
  })

  it('saves the edited chapter text from the drawer', async () => {
    const detail: CockpitChapterDetail = {
      id: 'chapter-uuid',
      chapterNumber: 1,
      title: '归港',
      content: '旧正文',
      scenes: [],
    }
    const wrapper = mount(ChapterDetailDrawer, {
      attachTo: document.body,
      props: {
        modelValue: true,
        projectId: 'project-1',
        chapterId: 'chapter-1',
        chapterDetail: detail,
      },
    })
    const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea')!
    textarea.value = '修改后的正文'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    document.body.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent?.includes('保存修改'))
        button.click()
    })

    expect(wrapper.emitted('save')).toEqual([['修改后的正文']])
    expect(document.body.textContent).toContain('第 1 章：归港')
    expect(document.body.textContent).not.toContain('chapter-uuid 章')
  })

  it('emits review decisions only for actionable narrative events', async () => {
    const event: CockpitNarrativeEvent = {
      id: 'event-1',
      type: 'character',
      status: 'pending_review',
      title: '人物变化',
      summary: '林岚决定返航',
      changeSetId: 'change-set-1',
      createdAt: '2026-08-11T06:00:00.000Z',
    }
    const wrapper = mount(NarrativeEventStream, { props: { events: [event] } })
    const buttons = wrapper.findAll('button')

    await buttons.find(button => button.text() === '采纳同步')!.trigger('click')
    await buttons.find(button => button.text() === '驳回丢弃')!.trigger('click')
    expect(wrapper.emitted('approve')).toEqual([['event-1', 'change-set-1']])
    expect(wrapper.emitted('reject')).toEqual([['event-1', 'change-set-1']])
  })

  it('renders normalized confidence and a chapter number instead of a chapter id', () => {
    const characterWrapper = mount(CharacterEmotionPanel, {
      props: {
        characters: [{ id: 'character-1', name: '林岚', confidence: 0.85 }],
      },
    })
    expect(characterWrapper.text()).toContain('置信度: 85%')

    const event = {
      id: 'event-1',
      type: 'conflict_update',
      status: 'auto_applied',
      title: '冲突演变',
      summary: '冲突升级',
      sourceChapterId: 'chapter-uuid',
      sourceChapterNumber: 3,
      createdAt: '2026-08-11T06:00:00.000Z',
    } as CockpitNarrativeEvent & { sourceChapterNumber: number }
    const eventWrapper = mount(NarrativeEventStream, { props: { events: [event] } })
    expect(eventWrapper.text()).toContain('第 3 章')
    expect(eventWrapper.text()).not.toContain('chapter-uuid')
  })

  it('exposes all four exception actions and confirms stopping the run', async () => {
    const wrapper = mount(ExceptionCenterPanel, {
      attachTo: document.body,
      props: {
        exceptions: [{
          id: 'exception-1',
          runId: 'run-1',
          projectId: 'project-1',
          chapterId: 'chapter-1',
          changeSetId: 'change-set-1',
          writingJobId: 'job-1',
          stepId: 'step-1',
          exceptionType: 'ai_failed',
          severity: 'high',
          title: '生成失败',
          description: '模型请求失败',
          status: 'open',
          resolution: null,
          createdAt: '2026-08-12T00:00:00.000Z',
          updatedAt: '2026-08-12T00:00:00.000Z',
        }],
      },
    })

    for (const [label, action] of [
      ['重试当前步骤', 'retry_step'],
      ['跳过章节', 'skip_chapter'],
      ['隔离章节', 'isolate_chapter'],
    ] as const) {
      await wrapper.findAll('button').find(button => button.text() === label)!.trigger('click')
      expect(wrapper.emitted('action')?.at(-1)).toEqual(['exception-1', action])
    }
    await wrapper.findAll('button').find(button => button.text() === '终止本轮')!.trigger('click')
    document.body.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent?.includes('确认终止'))
        button.click()
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('action')?.at(-1)).toEqual(['exception-1', 'stop_run'])
  })
})
