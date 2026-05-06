import type { ProjectStatus, UpdateProjectInput } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/projects'
import { getErrorMessage } from '@/utils/error-message'
import { T } from '@/utils/toast-message'

export function useProjectBasicSettings(projectId: string) {
  const toast = useToast()
  const router = useRouter()
  const projectStore = useProjectStore()

  const loading = ref(true)
  const saving = ref(false)
  const titleError = ref('')

  const form = ref({
    title: '',
    description: '',
    genre: '',
    theme: '',
    targetWords: '',
    targetAudience: '',
    styleProfile: '',
    status: 'planning' as ProjectStatus,
  })

  const statusOptions = [
    { label: '规划中', value: 'planning' },
    { label: '写作中', value: 'writing' },
    { label: '暂停', value: 'paused' },
    { label: '已完成', value: 'completed' },
    { label: '已归档', value: 'archived' },
  ]

  const projectStatusModel = computed<string | number>({
    get: () => form.value.status,
    set: (value) => {
      form.value.status = String(value) as ProjectStatus
    },
  })

  function syncFormFromProject() {
    const project = projectStore.currentProject
    if (!project)
      return
    form.value = {
      title: project.title,
      description: project.description || '',
      genre: project.genre || '',
      theme: project.theme || '',
      targetWords: project.targetWords ? String(project.targetWords) : '',
      targetAudience: project.targetAudience || '',
      styleProfile: project.styleProfile || '',
      status: project.status,
    }
  }

  onMounted(async () => {
    try {
      await projectStore.fetchProject(projectId)
      syncFormFromProject()
    }
    catch {
      toast.add(getErrorMessage('project_load'), 'error')
      router.push('/')
    }
    finally {
      loading.value = false
    }
  })

  function buildPayload(): UpdateProjectInput | null {
    titleError.value = ''
    const title = form.value.title.trim()
    if (!title) {
      titleError.value = '项目名称不能为空'
      return null
    }
    const targetWords = Number(form.value.targetWords)
    return {
      title,
      description: form.value.description.trim() || undefined,
      genre: form.value.genre.trim() || undefined,
      theme: form.value.theme.trim() || undefined,
      targetWords: Number.isFinite(targetWords) && targetWords > 0 ? targetWords : undefined,
      targetAudience: form.value.targetAudience.trim() || undefined,
      styleProfile: form.value.styleProfile.trim() || undefined,
      status: form.value.status,
    }
  }

  async function handleSave() {
    const payload = buildPayload()
    if (!payload)
      return
    saving.value = true
    try {
      await projectStore.updateProject(projectId, payload)
      syncFormFromProject()
      toast.add(T.project_saved, 'success')
    }
    catch {
      toast.add(getErrorMessage('project_save'), 'error')
    }
    finally {
      saving.value = false
    }
  }

  function handleReset() {
    syncFormFromProject()
    titleError.value = ''
    toast.add(T.project_reset, 'info')
  }

  return {
    loading,
    saving,
    titleError,
    form,
    statusOptions,
    projectStatusModel,
    projectStore,
    handleSave,
    handleReset,
  }
}
