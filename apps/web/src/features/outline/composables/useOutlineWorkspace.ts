import type { ChapterScene, ChapterStatus, CreateChapterElementInput } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { onMounted, ref } from 'vue'
import { useAIStream } from '@/composables/useAIStream'
import {
  useChapterElementStore,
  useChapterStore,
  useCharacterStore,
  useProjectStore,
  useSceneStore,
  useVolumeStore,
} from '@/stores/projects'
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
  const selectedChapterId = ref<string | null>(null)
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
    }
    catch {
      toast.add(getErrorMessage('outline_load'), 'error')
    }
    finally {
      loading.value = false
    }
  })

  async function selectChapter(id: string) {
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
    }
    catch {
      chapterElementDrafts.value = []
    }
    try {
      await sceneStore.fetchScenes(projectId, id)
    }
    catch {
      // scenes fetch failure is non-critical
    }
  }

  async function handleSave() {
    if (!selectedChapterId.value)
      return
    saving.value = true
    try {
      const data = {
        ...outlineForm.value,
        characters: JSON.stringify(outlineForm.value.characterIds),
      }
      await chapterStore.updateChapter(projectId, selectedChapterId.value, data)
      await chapterElementStore.replaceElements(projectId, selectedChapterId.value, {
        elements: chapterElementDrafts.value,
      })
      toast.add(T.outline_saved, 'success')
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
    if (index === -1)
      outlineForm.value.characterIds.push(charId)
    else
      outlineForm.value.characterIds.splice(index, 1)
  }

  function addCharacterElement(charId: string) {
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
      importance: 'major',
    })
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
    if (!selectedChapterId.value)
      return

    try {
      aiSuggestion.value = await streamAI({
        projectId,
        scene: 'outline',
        chapterId: selectedChapterId.value,
        userInstruction: `Based on the context, brainstorm a detailed outline for this chapter.
           Please provide: 1. Core Conflict, 2. Three Key Events, 3. An Ending Hook.
           Keep it concise and dramatic.`,
      })
    }
    catch (error: any) {
      toast.add(error.message || getErrorMessage('ai_brainstorm'), 'error')
      aiSuggestion.value = null
    }
  }

  function confirmOutlineAIResult(action: 'insert' | 'replace' | 'backup' | 'discard') {
    if (!aiSuggestion.value)
      return

    if (action === 'insert') {
      outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n\n` : '') + aiSuggestion.value
      toast.add(T.ai_inserted, 'success')
    }
    else if (action === 'replace') {
      outlineForm.value.events = aiSuggestion.value
      toast.add(T.ai_replaced, 'success')
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

    if (action === 'insert') {
      outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n\n` : '') + text
      toast.add(T.alt_inserted, 'success')
    }
    else {
      outlineForm.value.events = text
      toast.add(T.alt_replaced, 'success')
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
    selectedChapterId,
    expandedVolumes,
    outlineForm,
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
