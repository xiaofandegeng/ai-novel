import type { ForeshadowingImportance, ForeshadowingStatus } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
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
        relatedEvents: form.value.relatedEvents || undefined,
        notes: form.value.notes || undefined,
      })
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
        relatedEvents: form.value.relatedEvents || null,
        notes: form.value.notes || null,
      })
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
      relatedEvents: '',
      notes: '',
    }
  }

  return {
    loading,
    selectedId,
    showDeleteConfirm,
    form,
    selectedItem,
    groupedItems,
    projectStore,
    foreshadowingStore,
    selectItem,
    handleCreate,
    handleUpdate,
    handleDelete,
    resetForm,
  }
}
