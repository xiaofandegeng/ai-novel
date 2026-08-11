import { describe, expect, it } from 'vitest'
import { toErrorMessage } from './error-message'

describe('error message normalization', () => {
  it('uses Error messages and safe fallbacks for unknown values', () => {
    expect(toErrorMessage(new Error('网络不可用'))).toBe('网络不可用')
    expect(toErrorMessage({ message: 'untrusted shape' }, '保存失败')).toBe('保存失败')
    expect(toErrorMessage(null)).toBe('操作失败，请稍后重试')
  })
})
