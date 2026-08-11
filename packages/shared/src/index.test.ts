import type { ApiResponse, AutomationCockpitPayload, CockpitRunSummary } from './index'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { AI_PROVIDER_PRESETS } from './index'

describe('shared runtime contracts', () => {
  it('keeps provider identifiers unique and default models selectable', () => {
    const ids = AI_PROVIDER_PRESETS.map(provider => provider.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const provider of AI_PROVIDER_PRESETS) {
      expect(provider.id).not.toBe('')
      expect(provider.baseUrl).not.toBe('')
      expect(provider.models.map(model => model.value)).toContain(provider.defaultModel)
      if (provider.defaultEmbeddingModel)
        expect(provider.defaultEmbeddingModel).not.toBe(provider.defaultModel)
    }
  })

  it('keeps cockpit and API response contracts aligned across packages', () => {
    expectTypeOf<ApiResponse<AutomationCockpitPayload>['data']>().toEqualTypeOf<AutomationCockpitPayload | undefined>()
    expectTypeOf<CockpitRunSummary['strategy']>().toEqualTypeOf<'safe' | 'balanced' | 'fast'>()
  })
})
