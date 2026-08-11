import { afterEach, describe, expect, it, vi } from 'vitest'
import { useToast } from './useToast'

describe('toast lifecycle', () => {
  const toast = useToast()

  afterEach(() => {
    vi.useRealTimers()
    for (const item of [...toast.toasts.value])
      toast.remove(item.id)
  })

  it('adds and explicitly removes a toast', () => {
    toast.add('保存成功', 'success', 0)
    expect(toast.toasts.value).toMatchObject([{ message: '保存成功', type: 'success', duration: 0 }])

    toast.remove(toast.toasts.value[0].id)
    expect(toast.toasts.value).toEqual([])
  })

  it('automatically removes a timed toast', () => {
    vi.useFakeTimers()
    toast.add('处理中', 'info', 1200)
    expect(toast.toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(1200)
    expect(toast.toasts.value).toEqual([])
  })
})
