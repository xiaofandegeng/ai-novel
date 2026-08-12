import { describe, expect, it } from 'vitest'
import { buildStyleFingerprint, isSimilarTitle } from './chapter-postprocess.analysis'

describe('chapter postprocess analysis', () => {
  it('matches normalized narrative titles without matching empty values', () => {
    expect(isSimilarTitle('神秘来访者的秘密', '来客')).toBe(true)
    expect(isSimilarTitle('潮汐印记之谜', '潮汐印记')).toBe(true)
    expect(isSimilarTitle('雾港来信', '失踪名单')).toBe(false)
    expect(isSimilarTitle('', '雾港')).toBe(false)
  })

  it('builds a deterministic style fingerprint for empty and narrative content', () => {
    expect(buildStyleFingerprint('')).toEqual({
      sentenceLengthAvg: 0,
      dialogueRatio: 0,
      emotionDensity: 0,
      conflictDensity: 0,
      hookDensity: 0,
      styleSummary: '平均句长 0，对话比例 0%，情绪密度 0，冲突密度 0，钩子密度 0',
    })

    expect(buildStyleFingerprint('“钥匙！”她惊讶地推开门，却看见危险的影子。', '短句推进')).toMatchObject({
      sentenceLengthAvg: 10,
      emotionDensity: 20,
      conflictDensity: 20,
      hookDensity: 80,
      styleSummary: expect.stringContaining('风格备注：短句推进'),
    })
  })
})
