import type { ForeshadowingImportance, ForeshadowingStatus } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import * as api from '@/api/foreshadowing'
import { useCharacterStore } from '@/stores/character.store'
import { useForeshadowingStore } from '@/stores/foreshadowing.store'
import { useProjectStore } from '@/stores/project.store'
import { getErrorMessage } from '@/utils/error-message'
import { T } from '@/utils/toast-message'

export const FORESHADOWING_STATUS_LABEL: Record<ForeshadowingStatus, string> = {
  open: '待回收',
  progressing: '推进中',
  paid_off: '已回收',
  abandoned: '已放弃',
}

export const FORESHADOWING_STATUS_VARIANT: Record<ForeshadowingStatus, 'info' | 'warning' | 'success' | 'default'> = {
  open: 'info',
  progressing: 'warning',
  paid_off: 'success',
  abandoned: 'default',
}

export function useForeshadowingWorkspace(projectId: string) {
  const toast = useToast()
  const projectStore = useProjectStore()
  const characterStore = useCharacterStore()
  const foreshadowingStore = useForeshadowingStore()

  const loading = ref(true)
  const selectedId = ref<string | null>(null)
  const showDeleteConfirm = ref(false)

  const form = ref({
    title: '',
    description: '',
    setupChapterId: '',
    expectedPayoffChapterId: '',
    status: 'open' as ForeshadowingStatus,
    importance: 'normal' as ForeshadowingImportance,
    relatedCharacters: '',
    characterIds: [] as string[],
    relatedEvents: '',
    notes: '',
  })

  const selectedItem = computed(() =>
    foreshadowingStore.items.find(i => i.id === selectedId.value),
  )

  const groupedItems = computed(() => {
    const groups: Record<string, typeof foreshadowingStore.items> = {
      open: [],
      progressing: [],
      paid_off: [],
      abandoned: [],
    }
    for (const item of foreshadowingStore.items) {
      groups[item.status].push(item)
    }
    return groups
  })

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        characterStore.fetchCharacters(projectId),
        foreshadowingStore.fetchItems(projectId),
      ])
    }
    catch {
      toast.add(getErrorMessage('foreshadowing_load'), 'error')
    }
    finally {
      loading.value = false
    }
  })

  function selectItem(id: string) {
    selectedId.value = id
    const item = foreshadowingStore.items.find(i => i.id === id)
    if (item) {
      form.value = {
        title: item.title,
        description: item.description || '',
        setupChapterId: item.setupChapterId || '',
        expectedPayoffChapterId: item.expectedPayoffChapterId || '',
        status: item.status,
        importance: item.importance,
        relatedCharacters: item.relatedCharacters || '',
        characterIds: item.characterIds || [],
        relatedEvents: item.relatedEvents || '',
        notes: item.notes || '',
      }
    }
  }

  async function handleCreate() {
    try {
      const item = await foreshadowingStore.createItem(projectId, {
        title: form.value.title,
        description: form.value.description || undefined,
        status: form.value.status,
        importance: form.value.importance,
        relatedCharacters: form.value.relatedCharacters || undefined,
        characterIds: form.value.characterIds,
        relatedEvents: form.value.relatedEvents || undefined,
        notes: form.value.notes || undefined,
      })

      // Sync with junction table
      if (form.value.characterIds.length > 0) {
        await api.updateCharacters(
          projectId,
          item.id,
          form.value.characterIds.map(characterId => ({ characterId })),
        )
      }

      selectedId.value = item.id
      toast.add(T.foreshadowing_created, 'success')
    }
    catch {
      toast.add(getErrorMessage('foreshadowing_create'), 'error')
    }
  }

  async function handleUpdate() {
    if (!selectedId.value)
      return
    try {
      await foreshadowingStore.updateItem(projectId, selectedId.value, {
        title: form.value.title,
        description: form.value.description || null,
        status: form.value.status,
        importance: form.value.importance,
        relatedCharacters: form.value.relatedCharacters || null,
        characterIds: form.value.characterIds,
        relatedEvents: form.value.relatedEvents || null,
        notes: form.value.notes || null,
      })

      // Sync with junction table
      await api.updateCharacters(
        projectId,
        selectedId.value,
        form.value.characterIds.map(characterId => ({ characterId })),
      )

      toast.add(T.foreshadowing_updated, 'success')
    }
    catch {
      toast.add(getErrorMessage('foreshadowing_update'), 'error')
    }
  }

  async function handleDelete() {
    if (!selectedId.value)
      return
    try {
      await foreshadowingStore.deleteItem(projectId, selectedId.value)
      selectedId.value = null
      toast.add(T.foreshadowing_deleted, 'success')
    }
    catch {
      toast.add(getErrorMessage('foreshadowing_delete'), 'error')
    }
  }

  function resetForm() {
    selectedId.value = null
    form.value = {
      title: '',
      description: '',
      setupChapterId: '',
      expectedPayoffChapterId: '',
      status: 'open',
      importance: 'normal',
      relatedCharacters: '',
      characterIds: [],
      relatedEvents: '',
      notes: '',
    }
  }

  function toggleCharacter(id: string) {
    const index = form.value.characterIds.indexOf(id)
    if (index === -1)
      form.value.characterIds.push(id)
    else
      form.value.characterIds.splice(index, 1)
  }

  return {
    loading,
    selectedId,
    showDeleteConfirm,
    form,
    selectedItem,
    groupedItems,
    projectStore,
    characterStore,
    foreshadowingStore,
    selectItem,
    handleCreate,
    handleUpdate,
    handleDelete,
    resetForm,
    toggleCharacter,
  }
}
