import type { ChapterScene, ChapterStatus, CreateChapterElementInput } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { onMounted, ref } from 'vue'
import { useAIStream } from '@/composables/useAIStream'
import { useChapterElementStore } from '@/stores/chapter-element.store'
import { useChapterStore } from '@/stores/chapter.store'
import { useCharacterStore } from '@/stores/character.store'
import { useProjectStore } from '@/stores/project.store'
import { useSceneStore } from '@/stores/scene.store'
import { useVolumeStore } from '@/stores/volume.store'
import { getErrorMessage } from '@/utils/error-message'
import { T } from '@/utils/toast-message'

export function useOutlineWorkspace(projectId: string) {
  const toast = useToast()

  const projectStore = useProjectStore()
  const characterStore = useCharacterStore()
  const volumeStore = useVolumeStore()
  const chapterStore = useChapterStore()
  const chapterElementStore = useChapterElementStore()
  const sceneStore = useSceneStore()

  const loading = ref(true)
  const saving = ref(false)

  const selectedType = ref<'project' | 'volume' | 'chapter'>('chapter')
  const selectedId = ref<string | null>(null)
  const selectedChapterId = ref<string | null>(null) // Keep for backward compat or specific chapter logic

  const expandedVolumes = ref<Record<string, boolean>>({})

  const outlineForm = ref({
    title: '',
    goals: '',
    conflicts: '',
    events: '',
    emotionalArc: '',
    foreshadowing: '',
    endingHook: '',
    status: 'planning' as ChapterStatus,
    characterIds: [] as string[],
  })

  const volumeForm = ref({
    title: '',
    summary: '',
  })

  const projectForm = ref({
    title: '',
    description: '',
    genre: '',
    theme: '',
  })

  const chapterElementDrafts = ref<CreateChapterElementInput[]>([])
  const newEventName = ref('')

  const { isStreaming: isBrainstorming, stream: streamAI } = useAIStream()
  const aiSuggestion = ref<string | null>(null)
  const sceneSuggestion = ref<string | null>(null)
  const outlineAlternatives = ref<string[]>([])

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        characterStore.fetchCharacters(projectId),
        volumeStore.fetchVolumes(projectId),
        chapterStore.fetchChapters(projectId),
      ])

      volumeStore.volumes.forEach(v => expandedVolumes.value[v.id] = true)

      if (chapterStore.chapters.length > 0)
        selectChapter(chapterStore.chapters[0].id)
      else
        selectProject()
    }
    catch {
      toast.add(getErrorMessage('outline_load'), 'error')
    }
    finally {
      loading.value = false
    }
  })

  function selectProject() {
    selectedType.value = 'project'
    selectedId.value = projectId
    selectedChapterId.value = null

    if (projectStore.currentProject) {
      projectForm.value = {
        title: projectStore.currentProject.title,
        description: projectStore.currentProject.description || '',
        genre: projectStore.currentProject.genre || '',
        theme: projectStore.currentProject.theme || '',
      }
    }
  }

  function selectVolume(id: string) {
    selectedType.value = 'volume'
    selectedId.value = id
    selectedChapterId.value = null

    const vol = volumeStore.volumes.find(v => v.id === id)
    if (vol) {
      volumeForm.value = {
        title: vol.title,
        summary: vol.summary || '',
      }
    }
  }

  async function selectChapter(id: string) {
    selectedType.value = 'chapter'
    selectedId.value = id
    selectedChapterId.value = id
    const ch = chapterStore.chapters.find(c => c.id === id)
    if (ch) {
      outlineForm.value = {
        title: ch.title,
        goals: ch.goals || '',
        conflicts: ch.conflicts || '',
        events: ch.events || '',
        emotionalArc: ch.emotionalArc || '',
        foreshadowing: ch.foreshadowing || '',
        endingHook: ch.endingHook || '',
        status: ch.status,
        characterIds: ch.characters ? JSON.parse(ch.characters) : [],
      }
    }
    try {
      await chapterElementStore.fetchElements(projectId, id)
      chapterElementDrafts.value = chapterElementStore.elements.map(e => ({
        elementType: e.elementType,
        elementId: e.elementId || undefined,
        elementName: e.elementName,
        relationType: e.relationType,
        importance: e.importance,
        appearanceOrder: e.appearanceOrder || undefined,
        notes: e.notes || undefined,
      }))

      await sceneStore.fetchScenes(projectId, id)
    }
    catch {
      chapterElementDrafts.value = []
    }
  }

  async function handleSave() {
    if (!selectedId.value)
      return
    saving.value = true
    try {
      if (selectedType.value === 'project') {
        await projectStore.updateProject(projectId, projectForm.value)
        toast.add(T.outline_saved, 'success')
      }
      else if (selectedType.value === 'volume') {
        await volumeStore.updateVolume(projectId, selectedId.value, volumeForm.value)
        toast.add(T.outline_saved, 'success')
      }
      else if (selectedType.value === 'chapter') {
        // 最终一致性整理：确保登场角色和必须出场人物同步
        outlineForm.value.characterIds.forEach((id) => {
          const exists = chapterElementDrafts.value.some(e => e.elementType === 'character' && e.elementId === id)
          if (!exists) {
            addCharacterElement(id, 'normal')
          }
        })
        chapterElementDrafts.value.forEach((e) => {
          if (e.elementType === 'character' && e.elementId && !outlineForm.value.characterIds.includes(e.elementId)) {
            outlineForm.value.characterIds.push(e.elementId)
          }
        })

        const data = {
          ...outlineForm.value,
          characters: JSON.stringify(outlineForm.value.characterIds),
        }
        await chapterStore.updateChapter(projectId, selectedId.value, data)
        await chapterElementStore.replaceElements(projectId, selectedId.value, {
          elements: chapterElementDrafts.value,
        })
        toast.add(T.outline_saved, 'success')
      }
    }
    catch {
      toast.add(getErrorMessage('outline_save'), 'error')
    }
    finally {
      saving.value = false
    }
  }

  async function handleAddChapter(volumeId: string) {
    try {
      const lastChapter = chapterStore.chapters
        .filter(c => c.volumeId === volumeId)
        .sort((a, b) => b.chapterNumber - a.chapterNumber)[0]
      const nextNumber = lastChapter ? lastChapter.chapterNumber + 1 : 1

      const newCh = await chapterStore.createChapter(projectId, {
        title: `第 ${nextNumber} 章`,
        volumeId,
        chapterNumber: nextNumber,
        status: 'planning',
      })
      toast.add(T.chapter_added, 'success')
      selectChapter(newCh.id)
    }
    catch {
      toast.add(getErrorMessage('chapter_add'), 'error')
    }
  }

  async function handleAddVolume() {
    try {
      const nextOrder = volumeStore.volumes.length + 1
      await volumeStore.createVolume(projectId, {
        title: `第 ${nextOrder} 卷`,
        orderIndex: nextOrder,
      })
      toast.add(T.volume_added, 'success')
    }
    catch {
      toast.add(getErrorMessage('volume_add'), 'error')
    }
  }

  function toggleVolume(id: string) {
    expandedVolumes.value[id] = !expandedVolumes.value[id]
  }

  function toggleCharacter(charId: string) {
    const index = outlineForm.value.characterIds.indexOf(charId)
    if (index === -1) {
      outlineForm.value.characterIds.push(charId)
      // 自动同步：勾选登场角色时，自动添加为章节元素（默认普通重要程度）
      addCharacterElement(charId, 'normal')
    }
    else {
      outlineForm.value.characterIds.splice(index, 1)
      // 自动同步：取消登场时，如果该角色在元素列表中且是自动添加的（比如关系为 appears），则移除
      const elementIndex = chapterElementDrafts.value.findIndex(
        e => e.elementType === 'character' && e.elementId === charId && e.relationType === 'appears',
      )
      if (elementIndex !== -1) {
        chapterElementDrafts.value.splice(elementIndex, 1)
      }
    }
  }

  function addCharacterElement(charId: string, importance: 'major' | 'normal' = 'major') {
    const char = characterStore.characters.find(c => c.id === charId)
    if (!char)
      return
    const exists = chapterElementDrafts.value.some(
      e => e.elementType === 'character' && e.elementId === charId,
    )
    if (exists)
      return
    chapterElementDrafts.value.push({
      elementType: 'character',
      elementId: char.id,
      elementName: char.name,
      relationType: 'appears',
      importance,
    })

    // 同步反向更新 characterIds
    if (!outlineForm.value.characterIds.includes(charId)) {
      outlineForm.value.characterIds.push(charId)
    }
  }

  function removeElement(index: number) {
    chapterElementDrafts.value.splice(index, 1)
  }

  function addEventElement() {
    const name = newEventName.value.trim()
    if (!name)
      return
    chapterElementDrafts.value.push({
      elementType: 'event',
      elementName: name,
      relationType: 'occurs',
      importance: 'major',
    })
    newEventName.value = ''
  }

  async function handleAIBrainstorm() {
    if (!selectedId.value)
      return

    try {
      if (selectedType.value === 'project') {
        aiSuggestion.value = await streamAI({
          projectId,
          scene: 'project_outline',
          userInstruction: `请根据当前的作品基本设定，为全书进行全局性的“大纲规划”。
             输出要求：
             1. 必须使用中文。
             2. 必须包含以下结构化模块，并用【】括起标题：
             【核心主题】：深入探讨全书的核心表达和哲学思考。
             【类型基调】：明确作品的市场定位、语言风格和情感底色。
             【全书大纲】：梳理作品的主要线索、高潮转折和最终结局。
             
             语气要宏大且具有启发性。`,
        })
      }
      else if (selectedType.value === 'volume') {
        aiSuggestion.value = await streamAI({
          projectId,
          scene: 'volume_outline',
          volumeId: selectedId.value,
          userInstruction: `请根据全书设定和当前分卷信息，为本卷进行详细的“分卷规划”。
             输出要求：
             1. 必须使用中文。
             2. 必须包含以下结构化模块，并用【】括起标题：
             【核心任务】：本卷在全书结构中承载的主要功能。
             【分卷大纲】：本卷的具体起因、发展、高潮和收尾逻辑。
             
             要注重剧情的连贯性和矛盾的升级感。`,
        })
      }
      else {
        aiSuggestion.value = await streamAI({
          projectId,
          scene: 'outline',
          chapterId: selectedId.value,
          userInstruction: `请根据当前故事设定、人物档案和前文剧情，为本章进行深度“灵感风暴”。
             输出要求：
             1. 必须使用中文。
             2. 必须包含以下结构化模块，并用【】括起标题：
             【创作目标】：本章在全书结构中的定位和必须达成的目的。
             【核心冲突】：本章最核心的对抗点（内部或外部）。
             【情感基调】：希望带给读者的情绪体验及转变。
             【剧情拆解】：详细的行动步骤（1. 2. 3. ...）。
             【结尾悬念】：如何留住读者，引向下一章。
             
             语气要专业、富有戏剧张力，字数约 300-500 字。`,
        })
      }
    }
    catch (error: any) {
      toast.add(error.message || getErrorMessage('ai_brainstorm'), 'error')
      aiSuggestion.value = null
    }
  }

  function parseOutlineSuggestion(text: string) {
    // 更加宽容的正则，支持各种冒号和空格
    const extract = (key: string) => {
      const pattern = new RegExp(`【${key}】[:：\\s]*([\\s\\S]*?)(?=【|$)`, 'i')
      return text.match(pattern)?.[1]?.trim() || ''
    }

    const goals = extract('创作目标') || extract('本章目标') || extract('核心任务')
    const conflicts = extract('核心冲突')
    const emotionalArc = extract('情感基调') || extract('情绪基调') || extract('类型基调')
    const events = extract('剧情拆解') || extract('关键事件') || extract('情节拆解') || extract('分卷大纲') || extract('全书大纲')
    const endingHook = extract('结尾悬念') || extract('钩子')
    const theme = extract('核心主题')

    return { goals, conflicts, emotionalArc, events, endingHook, theme }
  }

  function confirmOutlineAIResult(action: 'insert' | 'replace' | 'backup' | 'discard') {
    if (!aiSuggestion.value)
      return

    if (action === 'insert' || action === 'replace') {
      const parsed = parseOutlineSuggestion(aiSuggestion.value)
      const hasParsedAny = Object.values(parsed).some(v => v.length > 0)

      if (selectedType.value === 'project') {
        if (action === 'replace') {
          if (hasParsedAny) {
            projectForm.value.theme = parsed.theme || projectForm.value.theme
            projectForm.value.genre = parsed.emotionalArc || projectForm.value.genre
            projectForm.value.description = parsed.events || projectForm.value.description
          }
          else {
            projectForm.value.description = aiSuggestion.value
          }
        }
        else {
          if (parsed.theme)
            projectForm.value.theme = (projectForm.value.theme ? `${projectForm.value.theme}\n` : '') + parsed.theme
          if (parsed.emotionalArc)
            projectForm.value.genre = (projectForm.value.genre ? `${projectForm.value.genre}\n` : '') + parsed.emotionalArc
          if (parsed.events)
            projectForm.value.description = (projectForm.value.description ? `${projectForm.value.description}\n` : '') + parsed.events
          if (!hasParsedAny)
            projectForm.value.description = (projectForm.value.description ? `${projectForm.value.description}\n\n` : '') + aiSuggestion.value
        }
      }
      else if (selectedType.value === 'volume') {
        if (action === 'replace') {
          if (hasParsedAny) {
            volumeForm.value.summary = parsed.events || volumeForm.value.summary
          }
          else {
            volumeForm.value.summary = aiSuggestion.value
          }
        }
        else {
          if (parsed.events)
            volumeForm.value.summary = (volumeForm.value.summary ? `${volumeForm.value.summary}\n` : '') + parsed.events
          if (!hasParsedAny)
            volumeForm.value.summary = (volumeForm.value.summary ? `${volumeForm.value.summary}\n\n` : '') + aiSuggestion.value
        }
      }
      else {
        // Chapter logic (existing)
        if (action === 'replace') {
          if (hasParsedAny) {
            outlineForm.value.goals = parsed.goals
            outlineForm.value.conflicts = parsed.conflicts
            outlineForm.value.emotionalArc = parsed.emotionalArc
            outlineForm.value.events = parsed.events
            outlineForm.value.endingHook = parsed.endingHook
          }
          else {
            outlineForm.value.events = aiSuggestion.value
          }
        }
        else {
          if (parsed.goals)
            outlineForm.value.goals = (outlineForm.value.goals ? `${outlineForm.value.goals}\n` : '') + parsed.goals
          if (parsed.conflicts)
            outlineForm.value.conflicts = (outlineForm.value.conflicts ? `${outlineForm.value.conflicts}\n` : '') + parsed.conflicts
          if (parsed.emotionalArc)
            outlineForm.value.emotionalArc = (outlineForm.value.emotionalArc ? `${outlineForm.value.emotionalArc}\n` : '') + parsed.emotionalArc
          if (parsed.events)
            outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n` : '') + parsed.events
          if (parsed.endingHook)
            outlineForm.value.endingHook = (outlineForm.value.endingHook ? `${outlineForm.value.endingHook}\n` : '') + parsed.endingHook
          if (!hasParsedAny)
            outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n\n` : '') + aiSuggestion.value
        }
      }
      toast.add('大纲已更新', 'success')
    }
    else if (action === 'backup') {
      outlineAlternatives.value.unshift(aiSuggestion.value)
      toast.add(T.ai_backup, 'success')
    }
    else {
      toast.add(T.ai_discarded, 'info')
    }

    aiSuggestion.value = null
  }

  function applyOutlineAlternative(index: number, action: 'insert' | 'replace') {
    const text = outlineAlternatives.value[index]
    if (!text)
      return

    const parsed = parseOutlineSuggestion(text)
    const hasParsedAny = Object.values(parsed).some(v => v.length > 0)

    if (action === 'replace') {
      if (hasParsedAny) {
        outlineForm.value.goals = parsed.goals
        outlineForm.value.conflicts = parsed.conflicts
        outlineForm.value.emotionalArc = parsed.emotionalArc
        outlineForm.value.events = parsed.events
        outlineForm.value.endingHook = parsed.endingHook
      }
      else {
        outlineForm.value.events = text
      }
      toast.add('已应用该备选方案', 'success')
    }
    else {
      if (hasParsedAny) {
        if (parsed.goals)
          outlineForm.value.goals = (outlineForm.value.goals ? `${outlineForm.value.goals}\n` : '') + parsed.goals
        if (parsed.conflicts)
          outlineForm.value.conflicts = (outlineForm.value.conflicts ? `${outlineForm.value.conflicts}\n` : '') + parsed.conflicts
        if (parsed.emotionalArc)
          outlineForm.value.emotionalArc = (outlineForm.value.emotionalArc ? `${outlineForm.value.emotionalArc}\n` : '') + parsed.emotionalArc
        if (parsed.events)
          outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n` : '') + parsed.events
        if (parsed.endingHook)
          outlineForm.value.endingHook = (outlineForm.value.endingHook ? `${outlineForm.value.endingHook}\n` : '') + parsed.endingHook
      }
      else {
        outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n\n` : '') + text
      }
      toast.add('备选方案内容已追加', 'success')
    }
  }

  function removeOutlineAlternative(index: number) {
    outlineAlternatives.value.splice(index, 1)
    toast.add(T.alt_removed, 'info')
  }

  async function addScene() {
    if (!selectedChapterId.value)
      return
    const nextNumber = sceneStore.scenes.length + 1
    try {
      await sceneStore.createScene(projectId, selectedChapterId.value, {
        sceneNumber: nextNumber,
        title: `场景 ${nextNumber}`,
        orderIndex: nextNumber,
        status: 'planned',
      })
    }
    catch {
      toast.add(getErrorMessage('scene_add'), 'error')
    }
  }

  async function updateSceneData(scene: ChapterScene) {
    if (!selectedChapterId.value)
      return
    try {
      await sceneStore.updateScene(projectId, selectedChapterId.value, scene.id, {
        title: scene.title,
        location: scene.location,
        timeline: scene.timeline,
        purpose: scene.purpose,
        summary: scene.summary,
        characters: scene.characters,
        conflict: scene.conflict,
        targetWords: scene.targetWords,
        status: scene.status,
      })
    }
    catch {
      toast.add(getErrorMessage('scene_update'), 'error')
    }
  }

  async function deleteScene(id: string) {
    if (!selectedChapterId.value)
      return
    try {
      await sceneStore.deleteScene(projectId, selectedChapterId.value, id)
    }
    catch {
      toast.add(getErrorMessage('scene_delete'), 'error')
    }
  }

  async function reorderScenes(orders: Array<{ id: string, orderIndex: number }>) {
    if (!selectedChapterId.value)
      return
    try {
      await sceneStore.reorderScenes(projectId, selectedChapterId.value, orders)
    }
    catch {
      toast.add(getErrorMessage('scene_reorder'), 'error')
    }
  }

  async function generateScenesAI() {
    if (!selectedChapterId.value)
      return
    try {
      sceneSuggestion.value = await streamAI({
        projectId,
        scene: 'outline',
        chapterId: selectedChapterId.value,
        userInstruction: `为当前章节规划场景列表。为每个场景提供：标题、地点、时间线、目的、冲突、出场角色、目标字数。
          返回 JSON 数组格式，每个元素包含 title, location, timeline, purpose, conflict, characters, targetWords 字段。`,
      })
    }
    catch (error: any) {
      toast.add(error.message || getErrorMessage('ai_scene_gen'), 'error')
      sceneSuggestion.value = null
    }
  }

  function extractSceneJson(raw: string): unknown {
    const fenced = raw.match(/```(?:json)?\s?([\s\S]*?)```/i)
    const text = (fenced?.[1] || raw).trim()
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end === -1 || end <= start)
      throw new Error('未找到 JSON 数组')
    return JSON.parse(text.slice(start, end + 1))
  }

  function parseSceneSuggestion(raw: string) {
    let parsed: unknown
    try {
      parsed = extractSceneJson(raw)
    }
    catch {
      return null
    }
    if (!Array.isArray(parsed))
      return null

    return parsed
      .map((item, index) => {
        const data = item && typeof item === 'object' ? item as Record<string, unknown> : {}
        const title = typeof data.title === 'string' ? data.title.trim() : ''
        const purpose = typeof data.purpose === 'string' ? data.purpose.trim() : ''
        if (!title && !purpose)
          return null
        const sceneNumber = index + 1
        return {
          sceneNumber,
          title: title || `场景 ${sceneNumber}`,
          location: typeof data.location === 'string' ? data.location : undefined,
          timeline: typeof data.timeline === 'string' ? data.timeline : undefined,
          purpose: purpose || undefined,
          conflict: typeof data.conflict === 'string' ? data.conflict : undefined,
          characters: typeof data.characters === 'string'
            ? data.characters
            : Array.isArray(data.characters)
              ? data.characters.filter(v => typeof v === 'string').join('、')
              : undefined,
          targetWords: typeof data.targetWords === 'number'
            ? data.targetWords
            : typeof data.targetWords === 'string'
              ? Number(data.targetWords) || undefined
              : undefined,
          orderIndex: sceneNumber,
          status: 'planned' as const,
        }
      })
      .filter(row => row !== null)
  }

  async function applySceneSuggestion(mode: 'append' | 'replace' = 'append') {
    if (!selectedChapterId.value || !sceneSuggestion.value)
      return

    const rows = parseSceneSuggestion(sceneSuggestion.value)
    if (!rows || rows.length === 0) {
      toast.add('AI 场景建议解析失败，请保留建议并手动调整后再录入。', 'error')
      return
    }

    try {
      await sceneStore.bulkCreateScenes(projectId, selectedChapterId.value, {
        scenes: rows,
        mode,
      })
      toast.add(mode === 'replace' ? `已替换为 ${rows.length} 个场景` : `已追加 ${rows.length} 个场景`, 'success')
      sceneSuggestion.value = null
    }
    catch {
      toast.add(getErrorMessage('scene_add'), 'error')
    }
  }

  function discardSceneSuggestion() {
    sceneSuggestion.value = null
    toast.add(T.ai_discarded, 'info')
  }

  return {
    loading,
    saving,
    selectedType,
    selectedId,
    selectedChapterId,
    expandedVolumes,
    outlineForm,
    projectForm,
    volumeForm,
    chapterElementDrafts,
    newEventName,
    isBrainstorming,
    aiSuggestion,
    sceneSuggestion,
    outlineAlternatives,
    projectStore,
    characterStore,
    volumeStore,
    chapterStore,
    selectProject,
    selectVolume,
    selectChapter,
    handleSave,
    handleAddChapter,
    handleAddVolume,
    toggleVolume,
    toggleCharacter,
    addCharacterElement,
    removeElement,
    addEventElement,
    handleAIBrainstorm,
    confirmOutlineAIResult,
    applyOutlineAlternative,
    removeOutlineAlternative,
    sceneStore,
    addScene,
    updateSceneData,
    deleteScene,
    reorderScenes,
    generateScenesAI,
    applySceneSuggestion,
    discardSceneSuggestion,
  }
}
