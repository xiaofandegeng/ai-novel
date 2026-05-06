import type { AIProviderPreset } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import * as settingsApi from '@/api/settings'

export function useAIProviderSettings(_projectId: string) {
  const toast = useToast()

  const saving = ref(false)
  const testing = ref(false)
  const aiTestMessage = ref('')
  const aiProviderPresets = ref<AIProviderPreset[]>([])

  const aiForm = ref({
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
    temperature: '70',
    hasApiKey: false,
  })

  const aiProviderOptions = computed(() =>
    aiProviderPresets.value.map(provider => ({
      label: provider.label,
      value: provider.id,
    })),
  )

  const currentAIProviderPreset = computed(() =>
    aiProviderPresets.value.find(provider => provider.id === aiForm.value.provider),
  )

  const aiModelOptions = computed(() =>
    currentAIProviderPreset.value?.models.map(model => ({
      label: model.label,
      value: model.value,
    })) || [],
  )

  const aiProviderModel = computed<string | number>({
    get: () => aiForm.value.provider,
    set: (value) => {
      applyAIProviderPreset(String(value))
    },
  })

  const aiModelSelectModel = computed<string | number>({
    get: () => aiForm.value.model,
    set: (value) => {
      aiForm.value.model = String(value)
    },
  })

  onMounted(async () => {
    try {
      const [aiSettings, providers] = await Promise.all([
        settingsApi.fetchAISettings(),
        settingsApi.fetchAIProviderPresets(),
      ])
      aiProviderPresets.value = providers
      aiForm.value = {
        provider: aiSettings.provider,
        baseUrl: aiSettings.baseUrl,
        model: aiSettings.model,
        apiKey: '',
        temperature: String(aiSettings.temperature),
        hasApiKey: aiSettings.hasApiKey,
      }
    }
    catch {
      // AI settings load failure is non-critical
    }
  })

  function applyAIProviderPreset(providerId: string) {
    aiForm.value.provider = providerId
    const preset = aiProviderPresets.value.find(provider => provider.id === providerId)
    if (!preset)
      return
    aiForm.value.baseUrl = preset.baseUrl
    aiForm.value.model = preset.defaultModel
    aiTestMessage.value = ''
  }

  function buildAISettingsPayload() {
    return {
      provider: aiForm.value.provider.trim() || 'openai-compatible',
      baseUrl: aiForm.value.baseUrl.trim(),
      model: aiForm.value.model.trim(),
      apiKey: aiForm.value.apiKey.trim() || undefined,
      temperature: Number(aiForm.value.temperature),
    }
  }

  async function handleSaveAI() {
    saving.value = true
    aiTestMessage.value = ''
    try {
      const settings = await settingsApi.updateAISettings(buildAISettingsPayload())
      aiForm.value.apiKey = ''
      aiForm.value.hasApiKey = settings.hasApiKey
      aiForm.value.temperature = String(settings.temperature)
      toast.add('AI 配置已保存', 'success')
    }
    catch {
      toast.add('AI 配置保存失败', 'error')
    }
    finally {
      saving.value = false
    }
  }

  async function handleTestAI() {
    testing.value = true
    aiTestMessage.value = ''
    try {
      const result = await settingsApi.testAISettings(buildAISettingsPayload())
      aiTestMessage.value = result.latencyMs
        ? `${result.message}，耗时 ${result.latencyMs}ms`
        : result.message
      toast.add(result.ok ? 'AI 服务检测通过' : 'AI 服务检测未通过', result.ok ? 'success' : 'warning')
    }
    catch {
      aiTestMessage.value = 'AI 服务检测失败'
      toast.add('AI 服务检测失败', 'error')
    }
    finally {
      testing.value = false
    }
  }

  return {
    aiForm,
    saving,
    testing,
    aiTestMessage,
    aiProviderOptions,
    currentAIProviderPreset,
    aiModelOptions,
    aiProviderModel,
    aiModelSelectModel,
    handleSaveAI,
    handleTestAI,
  }
}
