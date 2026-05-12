import type { CharacterRole, CreateCharacterInput } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import { useAIStream } from '@/composables/useAIStream'
import { useCharacterStore, useProjectStore } from '@/stores/projects'
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

interface CharacterAIProposal {
  kind: 'enrich' | 'create'
  raw: string
  summary: string
  fields: Partial<Record<CharacterTextField, string>>
  candidate?: CreateCharacterInput
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
    "arc": "成长曲线"
  }
}`
}

function parseCharacterAIProposal(raw: string, kind: CharacterAIProposal['kind']): CharacterAIProposal {
  const json = extractJSONObject(raw)
  const summary = normalizeAIText(json?.summary) || normalizeAIText(raw)

  if (kind === 'create') {
    const candidateSource = (json?.character && typeof json.character === 'object'
      ? json.character
      : json) as Record<string, unknown> | null
    const fields = collectFields(candidateSource)
    const name = normalizeAIText(candidateSource?.name) || 'AI 推荐角色'
    const role = normalizeRole(candidateSource?.role) || 'supporting'

    return {
      kind,
      raw,
      summary,
      fields,
      candidate: {
        name,
        role,
        ...fields,
      },
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
      const newChar = await characterStore.createCharacter(projectId, candidate)
      clearAIProposal()
      selectCharacter(newChar.id)
      toast.add('AI 推荐角色已创建', 'success')
    }
    catch {
      toast.add(getErrorMessage('character_add'), 'error')
    }
  }

  function retryAIRequest() {
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
    applyAIToCurrentCharacter,
    createCharacterFromAI,
    clearAIProposal,
    retryAIRequest,
  }
}
