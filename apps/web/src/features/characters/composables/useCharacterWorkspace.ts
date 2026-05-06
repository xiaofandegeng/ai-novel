import type { CharacterRole } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import { useAIStream } from '@/composables/useAIStream'
import { useCharacterStore, useProjectStore } from '@/stores/projects'
import { getCharacterRoleLabel } from '@/utils/character-labels'

interface CharForm {
  name: string
  role: CharacterRole | ''
  goal: string
  fear: string
  secret: string
  desire: string
  weakness: string
  personality: string
  arc: string
}

export function useCharacterWorkspace(projectId: string) {
  const toast = useToast()
  const projectStore = useProjectStore()
  const characterStore = useCharacterStore()

  const loading = ref(true)
  const saving = ref(false)
  const searchQuery = ref('')
  const selectedCharId = ref<string | null>(null)
  const showDeleteConfirm = ref(false)

  const charForm = ref<CharForm>({
    name: '',
    role: '',
    goal: '',
    fear: '',
    secret: '',
    desire: '',
    weakness: '',
    personality: '',
    arc: '',
  })

  const { isStreaming: isAnalyzing, stream: streamAI } = useAIStream()
  const aiSuggestion = ref<string | null>(null)

  const filteredCharacters = computed(() => {
    if (!searchQuery.value.trim())
      return characterStore.characters
    const q = searchQuery.value.toLowerCase()
    return characterStore.characters.filter(c =>
      c.name.toLowerCase().includes(q)
      || Boolean(c.role && c.role.toLowerCase().includes(q))
      || getCharacterRoleLabel(c.role).toLowerCase().includes(q),
    )
  })

  const charRoleModel = computed<string | number>({
    get: () => charForm.value.role,
    set: (value) => {
      charForm.value.role = String(value) as CharacterRole
    },
  })

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        characterStore.fetchCharacters(projectId),
      ])
      if (characterStore.characters.length > 0)
        selectCharacter(characterStore.characters[0].id)
    }
    catch {
      toast.add('加载角色数据失败，请稍后重试', 'error')
    }
    finally {
      loading.value = false
    }
  })

  function selectCharacter(id: string) {
    selectedCharId.value = id
    const char = characterStore.characters.find(c => c.id === id)
    if (char) {
      charForm.value = {
        name: char.name,
        role: char.role || '',
        goal: char.goal || '',
        fear: char.fear || '',
        secret: char.secret || '',
        desire: char.desire || '',
        weakness: char.weakness || '',
        personality: char.personality || '',
        arc: char.arc || '',
      }
    }
  }

  async function handleAddCharacter() {
    try {
      const newChar = await characterStore.createCharacter(projectId, {
        name: '新角色',
        role: 'supporting',
      })
      toast.add('角色已添加', 'success')
      selectCharacter(newChar.id)
    }
    catch {
      toast.add('添加角色失败，请稍后重试', 'error')
    }
  }

  async function handleSave() {
    if (!selectedCharId.value)
      return
    saving.value = true
    try {
      const data = {
        ...charForm.value,
        role: (charForm.value.role || undefined) as CharacterRole | undefined,
      }
      await characterStore.updateCharacter(projectId, selectedCharId.value, data)
      toast.add('角色已更新', 'success')
    }
    catch {
      toast.add('保存失败，请稍后重试', 'error')
    }
    finally {
      saving.value = false
    }
  }

  function confirmDelete() {
    if (!selectedCharId.value)
      return
    showDeleteConfirm.value = true
  }

  async function handleConfirmDelete() {
    if (!selectedCharId.value)
      return
    try {
      await characterStore.deleteCharacter(projectId, selectedCharId.value)
      toast.add('角色已删除', 'success')
      if (characterStore.characters.length > 0)
        selectCharacter(characterStore.characters[0].id)
      else
        selectedCharId.value = null
    }
    catch {
      toast.add('删除失败，请稍后重试', 'error')
    }
    finally {
      showDeleteConfirm.value = false
    }
  }

  async function handleAIAnalyze() {
    if (!selectedCharId.value) {
      toast.add('请先选择一个角色', 'warning')
      return
    }
    const prompt = `基于角色的基本信息（姓名：${charForm.value.name}，身份：${getCharacterRoleLabel(charForm.value.role)}），以及现有的性格描述："${charForm.value.personality || '无'}"，请深入分析该角色的行为动机，为其建议一些具有冲突性的恐惧、秘密与欲望。`
    try {
      aiSuggestion.value = await streamAI({
        projectId,
        scene: 'chat',
        userInstruction: prompt,
      })
    }
    catch (error: any) {
      aiSuggestion.value = `Error: ${error.message || 'AI 分析失败'}`
      toast.add(error.message || 'AI 分析失败', 'error')
    }
  }

  return {
    loading,
    saving,
    searchQuery,
    selectedCharId,
    showDeleteConfirm,
    charForm,
    charRoleModel,
    isAnalyzing,
    aiSuggestion,
    filteredCharacters,
    projectStore,
    characterStore,
    selectCharacter,
    handleAddCharacter,
    handleSave,
    confirmDelete,
    handleConfirmDelete,
    handleAIAnalyze,
  }
}
