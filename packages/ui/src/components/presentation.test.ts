import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NAppLayout from './NAppLayout.vue'
import NEmptyState from './NEmptyState.vue'
import NErrorState from './NErrorState.vue'
import NLoadingState from './NLoadingState.vue'
import NPanel from './NPanel.vue'
import NTag from './NTag.vue'

describe('design-system presentation components', () => {
  it('renders empty and error actions through their public slots', () => {
    const empty = mount(NEmptyState, {
      props: { title: '还没有项目', description: '创建第一个项目开始写作。' },
      slots: { action: '<button>创建项目</button>' },
    })
    const error = mount(NErrorState, {
      props: { title: '加载失败' },
      slots: { action: '<button>重试</button>' },
    })

    expect(empty.text()).toContain('创建第一个项目开始写作。')
    expect(empty.get('button').text()).toBe('创建项目')
    expect(error.get('button').text()).toBe('重试')
  })

  it('renders the requested number of text loading rows', () => {
    const wrapper = mount(NLoadingState, { props: { variant: 'text', rows: 3 } })
    expect(wrapper.findAll('.animate-pulse')).toHaveLength(3)
  })

  it('composes panel header, actions, body, and footer', () => {
    const wrapper = mount(NPanel, {
      props: { title: '运行状态', description: '最近一次任务' },
      slots: { default: '主体', actions: '<button>刷新</button>', footer: '页脚' },
    })
    expect(wrapper.text()).toContain('运行状态')
    expect(wrapper.text()).toContain('主体')
    expect(wrapper.text()).toContain('页脚')
    expect(wrapper.get('button').text()).toBe('刷新')
  })

  it('applies semantic tag variants while preserving slot text', () => {
    const wrapper = mount(NTag, { props: { variant: 'success', size: 'sm' }, slots: { default: '已完成' } })
    expect(wrapper.text()).toBe('已完成')
    expect(wrapper.classes()).toContain('text-semantic-success')
  })

  it('renders project context and optional rails in the application layout', () => {
    const wrapper = mount(NAppLayout, {
      props: { projectName: '雾港', currentChapter: '第 3 章' },
      slots: { default: '工作区', nav: '导航', context: '叙事状态', toolbar: '工具栏' },
    })
    expect(wrapper.text()).toContain('雾港')
    expect(wrapper.text()).toContain('第 3 章')
    expect(wrapper.text()).toContain('叙事状态')
    expect(wrapper.text()).toContain('工具栏')
  })
})
