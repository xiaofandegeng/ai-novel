import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import NConfirmDialog from './NConfirmDialog.vue'
import NDrawer from './NDrawer.vue'
import NModal from './NModal.vue'

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('design-system overlays', () => {
  it('locks scrolling and closes a modal with Escape', async () => {
    const wrapper = mount(NModal, {
      attachTo: document.body,
      props: { modelValue: true, title: '编辑项目' },
      slots: { default: '表单内容' },
    })
    await wrapper.vm.$nextTick()

    expect(document.body.style.overflow).toBe('hidden')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('closes a drawer from its accessible close button', async () => {
    const wrapper = mount(NDrawer, {
      attachTo: document.body,
      props: { modelValue: true, title: '章节详情' },
    })

    const closeButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
    expect(closeButton).not.toBeNull()
    closeButton!.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('keeps confirmation and cancellation as distinct events', async () => {
    const wrapper = mount(NConfirmDialog, {
      attachTo: document.body,
      props: {
        modelValue: true,
        title: '删除项目',
        description: '删除后无法恢复。',
        confirmText: '确认删除',
        cancelText: '保留项目',
        variant: 'danger',
      },
    })

    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    buttons.find(button => button.textContent?.trim() === '确认删除')!.click()
    await nextTick()
    expect(wrapper.emitted('confirm')).toHaveLength(1)

    buttons.find(button => button.textContent?.trim() === '保留项目')!.click()
    await nextTick()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })
})
