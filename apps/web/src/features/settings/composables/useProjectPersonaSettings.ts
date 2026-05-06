import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import * as personaApi from '@/api/persona'
import { getErrorMessage } from '@/utils/error-message'
import { T, W } from '@/utils/toast-message'

export function useProjectPersonaSettings(projectId: string) {
  const toast = useToast()

  const publishedPersonas = ref<any[]>([])
  const loading = ref(true)
  const loaded = ref(false)
  const personaForm = ref({
    personaId: '',
    strength: '65',
    enabledForOutline: true,
    enabledForDraft: true,
    enabledForPolish: false,
    enabledForQualityReview: false,
    projectOverrides: '',
  })
  const saving = ref(false)
  const preview = ref<string | null>(null)
  const loadingPreview = ref(false)

  const personaOptions = computed(() =>
    publishedPersonas.value.map(p => ({ label: p.name, value: p.id })),
  )

  onMounted(async () => {
    loading.value = true
    try {
      const [personas, config] = await Promise.all([
        personaApi.listPublishedPersonas(),
        personaApi.getProjectPersonaConfig(projectId),
      ])
      publishedPersonas.value = personas
      if (config) {
        personaForm.value = {
          personaId: config.personaId,
          strength: String(config.strength),
          enabledForOutline: Boolean(config.enabledForOutline),
          enabledForDraft: Boolean(config.enabledForDraft),
          enabledForPolish: Boolean(config.enabledForPolish),
          enabledForQualityReview: Boolean(config.enabledForQualityReview),
          projectOverrides: config.projectOverrides || '',
        }
      }
    }
    catch {
      // Persona is optional
    }
    finally {
      loaded.value = true
      loading.value = false
    }
  })

  async function handleSave() {
    if (!personaForm.value.personaId) {
      toast.add(W.persona_select_required, 'warning')
      return
    }
    saving.value = true
    try {
      await personaApi.updateProjectPersonaConfig(projectId, {
        personaId: personaForm.value.personaId,
        strength: Number(personaForm.value.strength),
        enabledForOutline: personaForm.value.enabledForOutline,
        enabledForDraft: personaForm.value.enabledForDraft,
        enabledForPolish: personaForm.value.enabledForPolish,
        enabledForQualityReview: personaForm.value.enabledForQualityReview,
        projectOverrides: personaForm.value.projectOverrides || undefined,
      })
      toast.add(T.persona_saved, 'success')
    }
    catch {
      toast.add(getErrorMessage('persona_save'), 'error')
    }
    finally {
      saving.value = false
    }
  }

  async function handlePreview() {
    loadingPreview.value = true
    preview.value = null
    try {
      const result = await personaApi.getPersonaPreview(projectId)
      if (result) {
        preview.value = `[${result.personaName}] 强度 ${result.strength}%\n\n${result.injectionPrompt}`
      }
      else {
        preview.value = '当前项目未绑定写作人格。'
      }
    }
    catch {
      toast.add(getErrorMessage('persona_preview'), 'error')
    }
    finally {
      loadingPreview.value = false
    }
  }

  return {
    loading,
    loaded,
    publishedPersonas,
    personaForm,
    saving,
    preview,
    loadingPreview,
    personaOptions,
    handleSave,
    handlePreview,
  }
}
