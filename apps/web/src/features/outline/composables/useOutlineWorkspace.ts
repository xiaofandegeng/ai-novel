import type { ChapterStatus, CreateChapterElementInput } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { onMounted, ref } from 'vue'
import { useAIStream } from '@/composables/useAIStream'
import {
  useChapterElementStore,
  useChapterStore,
  useCharacterStore,
  useProjectStore,
  useVolumeStore,
} from '@/stores/projects'

export function useOutlineWorkspace(projectId: string) {
  const toast = useToast()

  const projectStore = useProjectStore()
  const characterStore = useCharacterStore()
  const volumeStore = useVolumeStore()
  const chapterStore = useChapterStore()
  const chapterElementStore = useChapterElementStore()

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
      toast.add('大纲数据加载失败', 'error')
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
      toast.add('大纲已保存', 'success')
    }
    catch {
      toast.add('大纲保存失败', 'error')
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
      toast.add('章节已添加', 'success')
      selectChapter(newCh.id)
    }
    catch {
      toast.add('章节添加失败', 'error')
    }
  }

  async function handleAddVolume() {
    try {
      const nextOrder = volumeStore.volumes.length + 1
      await volumeStore.createVolume(projectId, {
        title: `第 ${nextOrder} 卷`,
        orderIndex: nextOrder,
      })
      toast.add('分卷已添加', 'success')
    }
    catch {
      toast.add('分卷添加失败', 'error')
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
      toast.add(error.message || 'AI 灵感风暴失败', 'error')
      aiSuggestion.value = null
    }
  }

  function confirmOutlineAIResult(action: 'insert' | 'replace' | 'backup' | 'discard') {
    if (!aiSuggestion.value)
      return

    if (action === 'insert') {
      outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n\n` : '') + aiSuggestion.value
      toast.add('AI 建议已插入关键事件', 'success')
    }
    else if (action === 'replace') {
      outlineForm.value.events = aiSuggestion.value
      toast.add('AI 建议已替换关键事件', 'success')
    }
    else if (action === 'backup') {
      toast.add('AI 建议已保存为备选', 'success')
    }
    else {
      toast.add('AI 建议已丢弃', 'info')
    }

    aiSuggestion.value = null
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
  }
}
