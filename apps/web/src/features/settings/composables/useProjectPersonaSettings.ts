import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import * as personaApi from '@/api/persona'

export function useProjectPersonaSettings(projectId: string) {
  const toast = useToast()

  const publishedPersonas = ref<any[]>([])
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
  })

  async function handleSave() {
    if (!personaForm.value.personaId) {
      toast.add('请先选择一个写作人格', 'warning')
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
      toast.add('写作人格配置已保存', 'success')
    }
    catch {
      toast.add('写作人格配置保存失败', 'error')
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
      toast.add('预览失败', 'error')
    }
    finally {
      loadingPreview.value = false
    }
  }

  return {
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
