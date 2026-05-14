import type { AIProviderPreset } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import * as settingsApi from '@/api/settings'
import { getErrorMessage } from '@/utils/error-message'
import { T, W } from '@/utils/toast-message'

export function useAIProviderSettings(_projectId: string) {
  const toast = useToast()

  const loading = ref(true)
  const loaded = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const embeddingTesting = ref(false)
  const aiTestMessage = ref('')
  const embeddingTestMessage = ref('')
  const aiProviderPresets = ref<AIProviderPreset[]>([])

  const aiForm = ref({
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
    temperature: '70',
    hasApiKey: false,

    embeddingProvider: 'openai-compatible',
    embeddingBaseUrl: 'https://api.openai.com/v1',
    embeddingModel: 'text-embedding-3-small',
    embeddingApiKey: '',
    hasEmbeddingApiKey: false,
    embeddingEnabled: true,
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

  const currentEmbeddingProviderPreset = computed(() =>
    aiProviderPresets.value.find(provider => provider.id === aiForm.value.embeddingProvider),
  )

  const aiModelOptions = computed(() =>
    currentAIProviderPreset.value?.models.map(model => ({
      label: model.label,
      value: model.value,
    })) || [],
  )

  const embeddingModelOptions = computed(() =>
    currentEmbeddingProviderPreset.value?.models.map(model => ({
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

  const embeddingProviderModel = computed<string | number>({
    get: () => aiForm.value.embeddingProvider,
    set: (value) => {
      applyEmbeddingProviderPreset(String(value))
    },
  })

  const aiModelSelectModel = computed<string | number>({
    get: () => aiForm.value.model,
    set: (value) => {
      aiForm.value.model = String(value)
    },
  })

  const embeddingModelSelectModel = computed<string | number>({
    get: () => aiForm.value.embeddingModel,
    set: (value) => {
      aiForm.value.embeddingModel = String(value)
    },
  })

  onMounted(async () => {
    loading.value = true
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

        embeddingProvider: aiSettings.embeddingProvider || aiSettings.provider,
        embeddingBaseUrl: aiSettings.embeddingBaseUrl || aiSettings.baseUrl,
        embeddingModel: aiSettings.embeddingModel || 'text-embedding-3-small',
        embeddingApiKey: '',
        hasEmbeddingApiKey: aiSettings.hasEmbeddingApiKey || false,
        embeddingEnabled: aiSettings.embeddingEnabled ?? true,
      }
      loaded.value = true
    }
    catch {
      toast.add(getErrorMessage('ai_config_load'), 'error')
    }
    finally {
      loading.value = false
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

  function applyEmbeddingProviderPreset(providerId: string) {
    aiForm.value.embeddingProvider = providerId
    const preset = aiProviderPresets.value.find(provider => provider.id === providerId)
    if (!preset)
      return
    aiForm.value.embeddingBaseUrl = preset.baseUrl
    aiForm.value.embeddingModel = preset.defaultEmbeddingModel || 'text-embedding-3-small'
    embeddingTestMessage.value = ''
  }

  function buildAISettingsPayload() {
    return {
      provider: aiForm.value.provider.trim() || 'openai-compatible',
      baseUrl: aiForm.value.baseUrl.trim(),
      model: aiForm.value.model.trim(),
      apiKey: aiForm.value.apiKey.trim() || undefined,
      temperature: Number(aiForm.value.temperature),

      embeddingProvider: aiForm.value.embeddingProvider.trim(),
      embeddingBaseUrl: aiForm.value.embeddingBaseUrl.trim(),
      embeddingModel: aiForm.value.embeddingModel.trim(),
      embeddingApiKey: aiForm.value.embeddingApiKey.trim() || undefined,
      embeddingEnabled: aiForm.value.embeddingEnabled,
    }
  }

  async function handleSaveAI() {
    if (!loaded.value) {
      toast.add(W.ai_config_loading, 'warning')
      return
    }
    saving.value = true
    aiTestMessage.value = ''
    embeddingTestMessage.value = ''
    try {
      const settings = await settingsApi.updateAISettings(buildAISettingsPayload())
      aiForm.value.apiKey = ''
      aiForm.value.embeddingApiKey = ''
      aiForm.value.hasApiKey = settings.hasApiKey
      aiForm.value.hasEmbeddingApiKey = settings.hasEmbeddingApiKey || false
      aiForm.value.temperature = String(settings.temperature)
      toast.add(T.ai_config_saved, 'success')
    }
    catch {
      toast.add(getErrorMessage('ai_config_save'), 'error')
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
      toast.add(result.ok ? T.ai_config_passed : W.ai_config_test_failed, result.ok ? 'success' : 'warning')
    }
    catch {
      aiTestMessage.value = getErrorMessage('ai_config_test')
      toast.add(getErrorMessage('ai_config_test'), 'error')
    }
    finally {
      testing.value = false
    }
  }

  async function handleTestEmbedding() {
    embeddingTesting.value = true
    embeddingTestMessage.value = ''
    try {
      const result = await settingsApi.testEmbeddingSettings(buildAISettingsPayload())
      embeddingTestMessage.value = result.dimensions
        ? `${result.message}，维度: ${result.dimensions}`
        : result.message
      toast.add(result.ok ? '向量化测试通过' : '向量化测试失败', result.ok ? 'success' : 'warning')
    }
    catch (e: any) {
      const msg = e.message || '向量化服务连接测试失败'
      embeddingTestMessage.value = msg
      toast.add(msg, 'error')
    }
    finally {
      embeddingTesting.value = false
    }
  }

  return {
    loading,
    loaded,
    aiForm,
    saving,
    testing,
    embeddingTesting,
    aiTestMessage,
    embeddingTestMessage,
    aiProviderOptions,
    currentAIProviderPreset,
    currentEmbeddingProviderPreset,
    aiModelOptions,
    embeddingModelOptions,
    aiProviderModel,
    embeddingProviderModel,
    aiModelSelectModel,
    embeddingModelSelectModel,
    handleSaveAI,
    handleTestAI,
    handleTestEmbedding,
  }
}
