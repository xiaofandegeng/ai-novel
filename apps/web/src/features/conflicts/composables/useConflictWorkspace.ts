import type { ConflictStatus, ConflictType } from '@ai-novel/shared'
import type { Component } from 'vue'
import { useToast } from '@ai-novel/ui'
import {
  AlertCircle,
  CheckCircle2,
  Flame,
  HelpCircle,
  TrendingUp,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import {
  useCharacterStore,
  useConflictStore,
  useProjectStore,
} from '@/stores/projects'
import { getErrorMessage } from '@/utils/error-message'
import { T } from '@/utils/toast-message'

export const CONFLICT_STATUS_OPTIONS: Array<{ value: ConflictStatus, label: string, icon: Component, color: string, bg: string }> = [
  { value: 'latent', label: '潜伏 / 萌芽', icon: HelpCircle, color: 'text-text-muted', bg: 'bg-bg-subtle' },
  { value: 'forming', label: '成型期', icon: AlertCircle, color: 'text-info', bg: 'bg-info/10' },
  { value: 'escalating', label: '激化中', icon: TrendingUp, color: 'text-warning', bg: 'bg-warning/10' },
  { value: 'exploding', label: '顶点 / 爆发', icon: Flame, color: 'text-semantic-error', bg: 'bg-semantic-error/10' },
  { value: 'resolved', label: '已解决', icon: CheckCircle2, color: 'text-semantic-success', bg: 'bg-semantic-success/10' },
]

export const CONFLICT_TYPES = [
  { value: 'external', label: '外部矛盾（角色 vs 他人/世界）' },
  { value: 'internal', label: '内部矛盾（角色 vs 自我）' },
]

export function useConflictWorkspace(projectId: string) {
  const toast = useToast()
  const projectStore = useProjectStore()
  const characterStore = useCharacterStore()
  const conflictStore = useConflictStore()

  const loading = ref(true)
  const saving = ref(false)
  const selectedConflictId = ref<string | null>(null)
  const showDeleteConfirm = ref(false)

  const conflictForm = ref({
    title: '',
    type: 'external' as ConflictType,
    intensity: 5,
    status: 'latent' as ConflictStatus,
    description: '',
    resolution: '',
    participants: [] as string[],
  })

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        characterStore.fetchCharacters(projectId),
        conflictStore.fetchConflicts(projectId),
      ])
      if (conflictStore.conflicts.length > 0)
        selectConflict(conflictStore.conflicts[0].id)
    }
    catch {
      toast.add(getErrorMessage('conflict_load'), 'error')
    }
    finally {
      loading.value = false
    }
  })

  function selectConflict(id: string) {
    selectedConflictId.value = id
    const conf = conflictStore.conflicts.find(c => c.id === id)
    if (conf) {
      conflictForm.value = {
        ...conf,
        description: conf.description || '',
        participants: conf.participants ? JSON.parse(conf.participants) : [],
        resolution: conf.resolution || '',
      }
    }
  }

  async function handleAdd() {
    try {
      const newConf = await conflictStore.createConflict(projectId, {
        title: '新冲突',
        type: 'external',
        intensity: 3,
        status: 'latent',
        description: '定义这场冲突的核心动因。',
      })
      toast.add(T.conflict_added, 'success')
      selectConflict(newConf.id)
    }
    catch {
      toast.add(getErrorMessage('conflict_add'), 'error')
    }
  }

  async function handleSave() {
    if (!selectedConflictId.value)
      return
    saving.value = true
    try {
      const data = {
        ...conflictForm.value,
        participants: JSON.stringify(conflictForm.value.participants),
      }
      await conflictStore.updateConflict(projectId, selectedConflictId.value, data)
      toast.add(T.conflict_updated, 'success')
    }
    catch {
      toast.add(getErrorMessage('conflict_save'), 'error')
    }
    finally {
      saving.value = false
    }
  }

  function confirmDelete() {
    if (!selectedConflictId.value)
      return
    showDeleteConfirm.value = true
  }

  async function handleConfirmDelete() {
    if (!selectedConflictId.value)
      return
    try {
      await conflictStore.deleteConflict(projectId, selectedConflictId.value)
      toast.add(T.conflict_deleted, 'success')
      selectedConflictId.value = null
    }
    catch {
      toast.add(getErrorMessage('conflict_delete'), 'error')
    }
    finally {
      showDeleteConfirm.value = false
    }
  }

  function toggleParticipant(id: string) {
    const index = conflictForm.value.participants.indexOf(id)
    if (index === -1)
      conflictForm.value.participants.push(id)
    else
      conflictForm.value.participants.splice(index, 1)
  }

  function getStatusStyle(status: string) {
    return CONFLICT_STATUS_OPTIONS.find(s => s.value === status)
  }

  return {
    loading,
    saving,
    selectedConflictId,
    showDeleteConfirm,
    conflictForm,
    projectStore,
    characterStore,
    conflictStore,
    selectConflict,
    handleAdd,
    handleSave,
    confirmDelete,
    handleConfirmDelete,
    toggleParticipant,
    getStatusStyle,
  }
}
