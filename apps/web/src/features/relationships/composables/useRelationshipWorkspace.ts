import { useToast } from '@ai-novel/ui'
import { onMounted, ref } from 'vue'
import { useCharacterStore } from '@/stores/character.store'
import { useProjectStore } from '@/stores/project.store'
import { useRelationshipStore } from '@/stores/relationship.store'
import { getErrorMessage } from '@/utils/error-message'
import { T, W } from '@/utils/toast-message'

export function useRelationshipWorkspace(projectId: string) {
  const toast = useToast()
  const projectStore = useProjectStore()
  const characterStore = useCharacterStore()
  const relationshipStore = useRelationshipStore()

  const loading = ref(true)
  const saving = ref(false)
  const selectedRelId = ref<string | null>(null)
  const showDeleteConfirm = ref(false)

  const relForm = ref({
    characterAId: '',
    characterBId: '',
    type: 'ally',
    strength: 5,
    description: '',
    status: '',
  })

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        characterStore.fetchCharacters(projectId),
        relationshipStore.fetchRelationships(projectId),
      ])
      if (relationshipStore.relationships.length > 0)
        selectRelationship(relationshipStore.relationships[0].id)
    }
    catch {
      toast.add(getErrorMessage('relationship_load'), 'error')
    }
    finally {
      loading.value = false
    }
  })

  function selectRelationship(id: string) {
    selectedRelId.value = id
    const rel = relationshipStore.relationships.find(r => r.id === id)
    if (rel) {
      relForm.value = {
        ...rel,
        description: rel.description || '',
        status: rel.status || '',
      }
    }
  }

  async function handleAdd() {
    if (characterStore.characters.length < 2) {
      toast.add(W.relationship_min, 'warning')
      return
    }
    try {
      const newRel = await relationshipStore.createRelationship(projectId, {
        characterAId: characterStore.characters[0].id,
        characterBId: characterStore.characters[1].id,
        type: 'ally',
        strength: 5,
        description: '新关系',
      })
      toast.add(T.relationship_added, 'success')
      selectRelationship(newRel.id)
    }
    catch {
      toast.add(getErrorMessage('relationship_add'), 'error')
    }
  }

  async function handleSave() {
    if (!selectedRelId.value)
      return
    saving.value = true
    try {
      await relationshipStore.updateRelationship(projectId, selectedRelId.value, relForm.value)
      toast.add(T.relationship_saved, 'success')
    }
    catch {
      toast.add(getErrorMessage('relationship_save'), 'error')
    }
    finally {
      saving.value = false
    }
  }

  function confirmDelete() {
    if (!selectedRelId.value)
      return
    showDeleteConfirm.value = true
  }

  async function handleConfirmDelete() {
    if (!selectedRelId.value)
      return
    try {
      await relationshipStore.deleteRelationship(projectId, selectedRelId.value)
      toast.add(T.relationship_deleted, 'success')
      selectedRelId.value = null
    }
    catch {
      toast.add(getErrorMessage('relationship_delete'), 'error')
    }
    finally {
      showDeleteConfirm.value = false
    }
  }

  function getCharName(id: string) {
    return characterStore.characters.find(c => c.id === id)?.name || '未知'
  }

  return {
    loading,
    saving,
    selectedRelId,
    showDeleteConfirm,
    relForm,
    projectStore,
    characterStore,
    relationshipStore,
    selectRelationship,
    handleAdd,
    handleSave,
    confirmDelete,
    handleConfirmDelete,
    getCharName,
  }
}
