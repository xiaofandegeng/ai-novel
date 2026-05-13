import type { Character, CharacterRole, CreateCharacterInput } from '@ai-novel/shared'
import type { CharacterAIProposal, CharacterCandidateInput, CharForm } from './character-ai-helpers'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import { useAIStream } from '@/composables/useAIStream'
import { useCharacterStore } from '@/stores/character.store'
import { useProjectStore } from '@/stores/project.store'
import { useRelationshipStore } from '@/stores/relationship.store'
import { getCharacterRoleLabel } from '@/utils/character-labels'
import { getErrorMessage } from '@/utils/error-message'
import { T, W } from '@/utils/toast-message'
import { characterTextFields, parseCharacterAIProposal } from './character-ai-helpers'
import { buildCharacterAnalysisPrompt, buildMinorCharactersPrompt, buildNewCharacterPrompt } from './character-ai-prompts'

export type { CharacterAIProposal, CharacterCandidateInput, CharForm } from './character-ai-helpers'

function toCreateCharacterInput(candidate: CharacterCandidateInput): CreateCharacterInput {
  const { relationSuggestions: _rs, ...input } = candidate
  return input
}

export function useCharacterWorkspace(projectId: string) {
  const toast = useToast()
  const projectStore = useProjectStore()
  const characterStore = useCharacterStore()
  const relationshipStore = useRelationshipStore()

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
  const aiProposal = ref<CharacterAIProposal | null>(null)
  const aiError = ref('')
  const lastAIRequest = ref<CharacterAIProposal['kind']>('enrich')

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

  const proposedFieldItems = computed(() => {
    const proposal = aiProposal.value
    if (!proposal)
      return []
    return characterTextFields
      .map(field => ({
        key: field.key,
        label: field.label,
        value: proposal.fields[field.key] || '',
      }))
      .filter(item => item.value.trim().length > 0)
  })

  const candidateRoleLabel = computed(() => getCharacterRoleLabel(aiProposal.value?.candidate?.role))

  const proposedCandidates = computed(() => {
    const proposal = aiProposal.value
    if (!proposal)
      return []
    if (proposal.kind === 'batch_create')
      return proposal.candidates || []
    return proposal.candidate ? [proposal.candidate] : []
  })

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        characterStore.fetchCharacters(projectId),
        relationshipStore.fetchRelationships(projectId),
      ])
      if (characterStore.characters.length > 0)
        selectCharacter(characterStore.characters[0].id)
    }
    catch {
      toast.add(getErrorMessage('character_load'), 'error')
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
      toast.add(T.character_added, 'success')
      selectCharacter(newChar.id)
    }
    catch {
      toast.add(getErrorMessage('character_add'), 'error')
    }
  }

  function findCharacterByName(name: string) {
    const normalized = name.trim()
    return characterStore.characters.find(c => c.name === normalized)
      || characterStore.characters.find(c => c.name.includes(normalized) || normalized.includes(c.name))
  }

  function getFallbackRelationshipTarget(newCharacterId: string) {
    return characterStore.characters.find(c => c.id !== newCharacterId && c.role === 'protagonist')
      || characterStore.characters.find(c => c.id !== newCharacterId)
  }

  function relationshipExists(characterAId: string, characterBId: string) {
    return relationshipStore.relationships.some(rel =>
      (rel.characterAId === characterAId && rel.characterBId === characterBId)
      || (rel.characterAId === characterBId && rel.characterBId === characterAId),
    )
  }

  async function createSuggestedRelationships(newCharacter: Character, candidate: CharacterCandidateInput) {
    const relations = candidate.relationSuggestions || []
    let createdCount = 0

    for (const relation of relations) {
      const target = findCharacterByName(relation.targetName)
      if (!target || target.id === newCharacter.id || relationshipExists(newCharacter.id, target.id))
        continue

      await relationshipStore.createRelationship(projectId, {
        characterAId: newCharacter.id,
        characterBId: target.id,
        type: relation.type,
        strength: relation.strength,
        status: relation.status,
        description: relation.description,
      })
      createdCount += 1
    }

    if (createdCount === 0) {
      const fallbackTarget = getFallbackRelationshipTarget(newCharacter.id)
      if (fallbackTarget && !relationshipExists(newCharacter.id, fallbackTarget.id)) {
        await relationshipStore.createRelationship(projectId, {
          characterAId: newCharacter.id,
          characterBId: fallbackTarget.id,
          type: 'acquaintance',
          strength: 2,
          status: '新角色已进入剧情关系网，具体互动等待后续章节确认。',
          description: `${newCharacter.name} 与 ${fallbackTarget.name} 的初始关联由系统自动补齐，避免角色游离于关系网之外。`,
        })
        createdCount += 1
      }
    }

    return createdCount
  }

  function clearAIProposal() {
    aiProposal.value = null
    aiError.value = ''
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
      toast.add(T.character_updated, 'success')
    }
    catch {
      toast.add(getErrorMessage('character_save'), 'error')
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
      toast.add(T.character_deleted, 'success')
      if (characterStore.characters.length > 0)
        selectCharacter(characterStore.characters[0].id)
      else
        selectedCharId.value = null
    }
    catch {
      toast.add(getErrorMessage('character_delete'), 'error')
    }
    finally {
      showDeleteConfirm.value = false
    }
  }

  async function handleAIAnalyze() {
    if (!selectedCharId.value) {
      toast.add(W.character_select_required, 'warning')
      return
    }
    lastAIRequest.value = 'enrich'
    clearAIProposal()
    try {
      const raw = await streamAI({
        projectId,
        scene: 'story_bible',
        userInstruction: buildCharacterAnalysisPrompt(charForm.value),
      })
      const proposal = parseCharacterAIProposal(raw, 'enrich')
      aiProposal.value = proposal
      if (proposedFieldItems.value.length === 0)
        aiError.value = 'AI 返回内容没有可回填的角色字段，请重试。'
    }
    catch (error: unknown) {
      aiError.value = error instanceof Error ? error.message : getErrorMessage('ai_analyze')
      toast.add(aiError.value, 'error')
    }
  }

  async function handleAINewCharacter() {
    lastAIRequest.value = 'create'
    clearAIProposal()
    try {
      const raw = await streamAI({
        projectId,
        scene: 'story_bible',
        userInstruction: buildNewCharacterPrompt(characterStore.characters.map(c => c.name)),
      })
      const proposal = parseCharacterAIProposal(raw, 'create')
      aiProposal.value = proposal
      if (!proposal.candidate?.name)
        aiError.value = 'AI 返回内容没有可创建的角色资料，请重试。'
    }
    catch (error: unknown) {
      aiError.value = error instanceof Error ? error.message : getErrorMessage('ai_analyze')
      toast.add(aiError.value, 'error')
    }
  }

  async function handleAIMinorCharacters() {
    lastAIRequest.value = 'batch_create'
    clearAIProposal()
    try {
      const raw = await streamAI({
        projectId,
        scene: 'story_bible',
        userInstruction: buildMinorCharactersPrompt(characterStore.characters.map(c => c.name)),
      })
      const proposal = parseCharacterAIProposal(raw, 'batch_create')
      aiProposal.value = proposal
      if (!proposal.candidates || proposal.candidates.length === 0)
        aiError.value = 'AI 返回内容没有可创建的小角色，请重试。'
    }
    catch (error: unknown) {
      aiError.value = error instanceof Error ? error.message : getErrorMessage('ai_analyze')
      toast.add(aiError.value, 'error')
    }
  }

  function applyAIToCurrentCharacter(mode: 'fill_empty' | 'replace') {
    if (!aiProposal.value || aiProposal.value.kind !== 'enrich')
      return

    for (const item of proposedFieldItems.value) {
      if (mode === 'replace' || !charForm.value[item.key].trim())
        charForm.value[item.key] = item.value
    }

    clearAIProposal()
    toast.add(mode === 'replace' ? 'AI 建议已覆盖到角色表单' : 'AI 建议已填入空白字段', 'success')
  }

  async function createCharacterFromAI() {
    const candidate = aiProposal.value?.candidate
    if (!candidate)
      return

    try {
      const newChar = await characterStore.createCharacter(projectId, toCreateCharacterInput(candidate))
      const relationshipCount = await createSuggestedRelationships(newChar, candidate)
      clearAIProposal()
      selectCharacter(newChar.id)
      toast.add(relationshipCount > 0 ? `AI 推荐角色已创建，并关联 ${relationshipCount} 段人物关系` : 'AI 推荐角色已创建', 'success')
    }
    catch {
      toast.add(getErrorMessage('character_add'), 'error')
    }
  }

  async function createCandidateFromAI(candidate: CharacterCandidateInput) {
    try {
      const newChar = await characterStore.createCharacter(projectId, toCreateCharacterInput(candidate))
      const relationshipCount = await createSuggestedRelationships(newChar, candidate)
      selectCharacter(newChar.id)

      if (aiProposal.value?.kind === 'batch_create') {
        aiProposal.value.candidates = aiProposal.value.candidates?.filter(c => c !== candidate)
        if (!aiProposal.value.candidates || aiProposal.value.candidates.length === 0)
          clearAIProposal()
      }
      else {
        clearAIProposal()
      }

      toast.add(relationshipCount > 0 ? `AI 推荐角色已创建，并关联 ${relationshipCount} 段人物关系` : 'AI 推荐角色已创建', 'success')
    }
    catch {
      toast.add(getErrorMessage('character_add'), 'error')
    }
  }

  async function createAllMinorCharactersFromAI() {
    const candidates = [...(aiProposal.value?.candidates || [])]
    if (candidates.length === 0)
      return

    try {
      let lastCreatedId = ''
      let relationshipCount = 0
      for (const candidate of candidates) {
        const newChar = await characterStore.createCharacter(projectId, toCreateCharacterInput(candidate))
        lastCreatedId = newChar.id
        relationshipCount += await createSuggestedRelationships(newChar, candidate)
      }
      clearAIProposal()
      if (lastCreatedId)
        selectCharacter(lastCreatedId)
      toast.add(`已创建 ${candidates.length} 个小角色，并关联 ${relationshipCount} 段人物关系`, 'success')
    }
    catch {
      toast.add('部分小角色创建失败，请检查后重试', 'error')
    }
  }

  function retryAIRequest() {
    if (lastAIRequest.value === 'batch_create')
      return handleAIMinorCharacters()
    if (lastAIRequest.value === 'create')
      return handleAINewCharacter()
    return handleAIAnalyze()
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
    aiProposal,
    aiError,
    proposedFieldItems,
    candidateRoleLabel,
    proposedCandidates,
    filteredCharacters,
    projectStore,
    characterStore,
    selectCharacter,
    handleAddCharacter,
    handleSave,
    confirmDelete,
    handleConfirmDelete,
    handleAIAnalyze,
    handleAINewCharacter,
    handleAIMinorCharacters,
    applyAIToCurrentCharacter,
    createCharacterFromAI,
    createCandidateFromAI,
    createAllMinorCharactersFromAI,
    clearAIProposal,
    retryAIRequest,
  }
}
