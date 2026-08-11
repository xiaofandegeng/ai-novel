import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NButton from './NButton.vue'
import NIconButton from './NIconButton.vue'
import NInput from './NInput.vue'
import NSelect from './NSelect.vue'
import NTextArea from './NTextArea.vue'

describe('design-system form controls', () => {
  it('emits button clicks only while enabled', async () => {
    const wrapper = mount(NButton, { slots: { default: '保存' } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    await wrapper.setProps({ loading: true })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('gives icon-only buttons an accessible name and visible tooltip text', async () => {
    const wrapper = mount(NIconButton, {
      props: { label: '刷新数据' },
      slots: { default: '<span>↻</span>' },
    })

    expect(wrapper.get('button').attributes('aria-label')).toBe('刷新数据')
    expect(wrapper.text()).toContain('刷新数据')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('connects input labels and emits text updates', async () => {
    const wrapper = mount(NInput, { props: { label: '项目名称', modelValue: '', error: '不能为空' } })
    const input = wrapper.get('input')

    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
    await input.setValue('雾港')
    expect(wrapper.emitted('update:modelValue')).toEqual([['雾港']])
    expect(wrapper.text()).toContain('不能为空')
  })

  it('emits text-area changes and respects manual resize mode', async () => {
    const wrapper = mount(NTextArea, { props: { label: '简介', autoResize: false } })
    const textarea = wrapper.get('textarea')

    await textarea.setValue('潮雾笼罩港口。')
    expect(wrapper.emitted('update:modelValue')).toEqual([['潮雾笼罩港口。']])
    expect(textarea.classes()).toContain('resize-y')
  })

  it('preserves numeric and string select option values', async () => {
    const wrapper = mount(NSelect, {
      props: {
        label: '策略',
        options: [
          { label: '安全', value: 1 },
          { label: '平衡', value: 'balanced' },
        ],
      },
    })

    await wrapper.get('select').setValue('1')
    await wrapper.get('select').setValue('balanced')
    expect(wrapper.emitted('update:modelValue')).toEqual([[1], ['balanced']])
  })
})
