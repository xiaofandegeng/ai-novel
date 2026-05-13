import type { Character, CharacterRole, CreateCharacterInput } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import { useAIStream } from '@/composables/useAIStream'
import { useCharacterStore } from '@/stores/character.store'
import { useProjectStore } from '@/stores/project.store'
import { useRelationshipStore } from '@/stores/relationship.store'
import { getCharacterRoleLabel } from '@/utils/character-labels'
import { getErrorMessage } from '@/utils/error-message'
import { T, W } from '@/utils/toast-message'

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

type CharacterTextField = Exclude<keyof CharForm, 'name' | 'role'>
type RelationshipType = 'ally' | 'enemy' | 'lover' | 'family' | 'mentor' | 'rival' | 'acquaintance'

interface CharacterRelationSuggestion {
  targetName: string
  type: RelationshipType
  strength: number
  status: string
  description: string
}

interface CharacterCandidateInput extends CreateCharacterInput {
  relationSuggestions?: CharacterRelationSuggestion[]
}

interface CharacterAIProposal {
  kind: 'enrich' | 'create' | 'batch_create'
  raw: string
  summary: string
  fields: Partial<Record<CharacterTextField, string>>
  candidate?: CharacterCandidateInput
  candidates?: CharacterCandidateInput[]
}

const characterTextFields: Array<{ key: CharacterTextField, label: string }> = [
  { key: 'personality', label: '性格概括' },
  { key: 'goal', label: '当前目标' },
  { key: 'desire', label: '核心欲望' },
  { key: 'fear', label: '核心恐惧' },
  { key: 'secret', label: '灰暗秘密' },
  { key: 'weakness', label: '性格软肋' },
  { key: 'arc', label: '成长曲线' },
]

const characterRoles: CharacterRole[] = ['protagonist', 'antagonist', 'mentor', 'ally', 'supporting', 'extra']
const relationshipTypes: RelationshipType[] = ['ally', 'enemy', 'lover', 'family', 'mentor', 'rival', 'acquaintance']

function extractJSONObject(raw: string) {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  }
  catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
      }
      catch {
        return null
      }
    }
    return null
  }
}

function normalizeAIText(value: unknown) {
  if (typeof value !== 'string')
    return ''

  return value
    .replace(/\r\n/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^-{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeRole(value: unknown): CharacterRole | undefined {
  if (typeof value !== 'string')
    return undefined
  if (characterRoles.includes(value as CharacterRole))
    return value as CharacterRole

  const roleMap: Record<string, CharacterRole> = {
    主角: 'protagonist',
    反派: 'antagonist',
    导师: 'mentor',
    盟友: 'ally',
    配角: 'supporting',
    重要配角: 'supporting',
    群众角色: 'extra',
    路人: 'extra',
  }
  return roleMap[value.trim()]
}

function normalizeRelationshipType(value: unknown): RelationshipType {
  if (typeof value !== 'string')
    return 'acquaintance'
  if (relationshipTypes.includes(value as RelationshipType))
    return value as RelationshipType

  const typeMap: Record<string, RelationshipType> = {
    盟友: 'ally',
    朋友: 'ally',
    敌人: 'enemy',
    仇敌: 'enemy',
    恋人: 'lover',
    家人: 'family',
    血缘: 'family',
    导师: 'mentor',
    师徒: 'mentor',
    对手: 'rival',
    竞争对手: 'rival',
    熟人: 'acquaintance',
    线索关系: 'acquaintance',
  }
  return typeMap[value.trim()] || 'acquaintance'
}

function normalizeStrength(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue))
    return 3
  return Math.min(10, Math.max(1, Math.round(numberValue)))
}

function collectFields(source: Record<string, unknown> | null | undefined) {
  const fields: Partial<Record<CharacterTextField, string>> = {}
  if (!source)
    return fields

  for (const field of characterTextFields) {
    const value = normalizeAIText(source[field.key])
    if (value)
      fields[field.key] = value
  }
  return fields
}

function collectRelationSuggestions(source: Record<string, unknown> | null | undefined) {
  const relations = Array.isArray(source?.relations)
    ? source.relations
    : Array.isArray(source?.relationshipSuggestions)
      ? source.relationshipSuggestions
      : []

  return relations
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      targetName: normalizeAIText(item.targetName || item.characterName || item.target),
      type: normalizeRelationshipType(item.type),
      strength: normalizeStrength(item.strength),
      status: normalizeAIText(item.status) || '初次产生交集，关系仍待剧情推进确认。',
      description: normalizeAIText(item.description) || '由 AI 创建角色时自动生成的初始人物关系。',
    }))
    .filter(item => item.targetName.length > 0)
}

function buildCharacterAnalysisPrompt(charForm: CharForm) {
  return `请基于当前项目的故事设定、已有大纲、人物关系和该角色资料，分析并补全当前角色。

当前角色：
- 姓名：${charForm.name || '未命名'}
- 身份定位：${getCharacterRoleLabel(charForm.role)}
- 性格概括：${charForm.personality || '暂无'}
- 当前目标：${charForm.goal || '暂无'}

请只返回 JSON，不要 Markdown，不要解释，不要让作者继续选择：
{
  "summary": "一句话说明本次补全方向",
  "fields": {
    "personality": "可直接写入性格概括的内容",
    "goal": "可直接写入当前目标的内容",
    "desire": "可直接写入核心欲望的内容",
    "fear": "可直接写入核心恐惧的内容",
    "secret": "可直接写入灰暗秘密的内容",
    "weakness": "可直接写入性格软肋的内容",
    "arc": "可直接写入成长曲线的内容"
  }
}`
}

function buildNewCharacterPrompt(existingNames: string[]) {
  return `请结合当前项目的世界观、主线矛盾、已有角色、章节走向和人物关系，推荐一个能推动剧情的新角色。

已有角色：${existingNames.length > 0 ? existingNames.join('、') : '暂无'}

要求：
1. 新角色必须服务于当前剧情，不要凭空加入无关设定。
2. 新角色要带来新的冲突、信息差、诱惑或阻碍。
3. 不要和已有角色功能重复。
4. 只返回 JSON，不要 Markdown，不要解释。

返回格式：
{
  "summary": "为什么这个角色适合加入当前故事",
  "character": {
    "name": "角色姓名",
    "role": "protagonist | antagonist | mentor | ally | supporting | extra",
    "personality": "性格概括",
    "goal": "当前目标",
    "desire": "核心欲望",
    "fear": "核心恐惧",
    "secret": "灰暗秘密",
    "weakness": "性格软肋",
    "arc": "成长曲线",
    "relations": [
      {
        "targetName": "必须填写已有角色姓名",
        "type": "ally | enemy | lover | family | mentor | rival | acquaintance",
        "strength": 1,
        "status": "当前互动状态",
        "description": "这段关系为什么存在，以及它如何推动剧情"
      }
    ]
  }
}`
}

function buildMinorCharactersPrompt(existingNames: string[]) {
  return `请结合当前项目的世界观、主线矛盾、已有角色、章节走向和人物关系，批量推荐 5 个无关紧要但好用的小角色。

已有角色：${existingNames.length > 0 ? existingNames.join('、') : '暂无'}

小角色定义：
1. 不是主角团、反派核心、导师或关键盟友。
2. 可以是店主、守卫、档案员、邻居、目击者、信使、路人、临时雇员、失踪者家属等。
3. 每个角色只需要一个清晰功能：提供线索、制造误会、拦路、传递风声、展示世界规则、烘托氛围。
4. 不要和已有角色重名，不要引入会抢走主线的新设定。
5. 只返回 JSON，不要 Markdown，不要解释。

返回格式：
{
  "summary": "这批小角色适合补充在哪类剧情场景中",
  "characters": [
    {
      "name": "角色姓名",
      "role": "extra",
      "personality": "一句话性格或识别特征",
      "goal": "本角色在剧情中的即时目的",
      "desire": "简单欲望",
      "fear": "简单恐惧",
      "secret": "可选的小秘密或可利用信息",
      "weakness": "可被剧情利用的弱点",
      "arc": "登场用途与退场方式",
      "relations": [
        {
          "targetName": "必须填写已有角色姓名",
          "type": "acquaintance | ally | enemy | rival",
          "strength": 1,
          "status": "小角色和目标角色当前的交集",
          "description": "小角色给目标角色带来的线索、阻碍或氛围功能"
        }
      ]
    }
  ]
}`
}

function normalizeCandidate(source: Record<string, unknown> | null | undefined, fallbackName: string): CharacterCandidateInput {
  const fields = collectFields(source)
  const name = normalizeAIText(source?.name) || fallbackName
  const role = normalizeRole(source?.role) || 'extra'
  const relationSuggestions = collectRelationSuggestions(source)

  return {
    name,
    role,
    ...fields,
    relationSuggestions,
  }
}

function parseCharacterAIProposal(raw: string, kind: CharacterAIProposal['kind']): CharacterAIProposal {
  const json = extractJSONObject(raw)
  const summary = normalizeAIText(json?.summary) || normalizeAIText(raw)

  if (kind === 'batch_create') {
    const sources = Array.isArray(json?.characters)
      ? json.characters
      : Array.isArray(json)
        ? json
        : []
    const candidates = sources
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item, index) => normalizeCandidate(item, `AI 小角色 ${index + 1}`))
      .filter(candidate => candidate.name.trim().length > 0)

    return {
      kind,
      raw,
      summary,
      fields: {},
      candidates,
    }
  }

  if (kind === 'create') {
    const candidateSource = (json?.character && typeof json.character === 'object'
      ? json.character
      : json) as Record<string, unknown> | null
    const candidate = normalizeCandidate(candidateSource, 'AI 推荐角色')

    return {
      kind,
      raw,
      summary,
      fields: collectFields(candidateSource),
      candidate,
    }
  }

  const fieldsSource = (json?.fields && typeof json.fields === 'object'
    ? json.fields
    : json) as Record<string, unknown> | null

  return {
    kind,
    raw,
    summary,
    fields: collectFields(fieldsSource),
  }
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

  function toCreateCharacterInput(candidate: CharacterCandidateInput): CreateCharacterInput {
    const { relationSuggestions: _relationSuggestions, ...characterInput } = candidate
    return characterInput
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
    catch (error: any) {
      aiError.value = error.message || getErrorMessage('ai_analyze')
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
    catch (error: any) {
      aiError.value = error.message || getErrorMessage('ai_analyze')
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
    catch (error: any) {
      aiError.value = error.message || getErrorMessage('ai_analyze')
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
