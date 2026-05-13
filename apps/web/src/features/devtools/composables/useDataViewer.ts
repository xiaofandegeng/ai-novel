import type { CharacterRole, NovelProject } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { onMounted, ref } from 'vue'
import { useChapterStore } from '@/stores/chapter.store'
import { useCharacterStore } from '@/stores/character.store'
import { useProjectStore } from '@/stores/project.store'
import { useStoryBibleStore } from '@/stores/story-bible.store'
import { useVolumeStore } from '@/stores/volume.store'
import { getErrorMessage } from '@/utils/error-message'
import { T } from '@/utils/toast-message'

export function useDataViewer() {
  const toast = useToast()
  const projectStore = useProjectStore()
  const storyBibleStore = useStoryBibleStore()
  const characterStore = useCharacterStore()
  const volumeStore = useVolumeStore()
  const chapterStore = useChapterStore()

  const loading = ref(true)
  const selectedProjectId = ref<string | null>(null)
  const showCreateModal = ref(false)
  const showEditProjectModal = ref(false)
  const createError = ref('')

  const formTitle = ref('')
  const formGenre = ref('')
  const formTheme = ref('')
  const formTargetWords = ref('')

  onMounted(async () => {
    try {
      await projectStore.fetchProjects()
    }
    finally {
      loading.value = false
    }
  })

  async function selectProject(id: string) {
    selectedProjectId.value = id
    await Promise.all([
      projectStore.fetchProject(id),
      storyBibleStore.fetchStoryBible(id),
      characterStore.fetchCharacters(id),
      volumeStore.fetchVolumes(id),
      chapterStore.fetchChapters(id),
    ])
  }

  function deselectProject() {
    selectedProjectId.value = null
    projectStore.currentProject = null
    storyBibleStore.storyBible = null
    characterStore.characters = []
    volumeStore.volumes = []
    chapterStore.chapters = []
  }

  function openCreateModal() {
    formTitle.value = ''
    formGenre.value = ''
    formTheme.value = ''
    formTargetWords.value = ''
    createError.value = ''
    showCreateModal.value = true
  }

  function openEditProjectModal() {
    const p = projectStore.currentProject
    if (!p)
      return
    formTitle.value = p.title
    formGenre.value = p.genre || ''
    formTheme.value = p.theme || ''
    formTargetWords.value = p.targetWords?.toString() || ''
    createError.value = ''
    showEditProjectModal.value = true
  }

  async function handleCreate() {
    if (!formTitle.value.trim()) {
      createError.value = '请输入项目标题'
      return
    }
    try {
      await projectStore.createProject({
        title: formTitle.value.trim(),
        genre: formGenre.value.trim() || undefined,
        theme: formTheme.value.trim() || undefined,
        targetWords: formTargetWords.value ? Number(formTargetWords.value) : undefined,
      })
      showCreateModal.value = false
      toast.add(T.project_created, 'success')
    }
    catch (e: any) {
      createError.value = e.message || '项目创建失败'
      toast.add(getErrorMessage('project_create'), 'error')
    }
  }

  async function handleUpdateProject() {
    if (!selectedProjectId.value || !formTitle.value.trim())
      return
    try {
      const data: Partial<NovelProject> = {
        title: formTitle.value.trim(),
        genre: formGenre.value.trim() || undefined,
        theme: formTheme.value.trim() || undefined,
        targetWords: formTargetWords.value ? Number(formTargetWords.value) : undefined,
      }
      await projectStore.updateProject(selectedProjectId.value, data)
      showEditProjectModal.value = false
      toast.add(T.project_updated, 'success')
    }
    catch (e: any) {
      createError.value = e.message || '项目更新失败'
      toast.add(getErrorMessage('project_update'), 'error')
    }
  }

  const showDeleteConfirm = ref(false)
  const pendingDelete = ref<{
    type: 'project' | 'character' | 'volume' | 'chapter'
    id: string
    title: string
    description: string
  } | null>(null)

  function confirmDelete(id: string) {
    pendingDelete.value = {
      type: 'project',
      id,
      title: '删除项目',
      description: '确定要删除这个项目吗？这将永久删除所有角色、故事设定、分卷和章节，此操作无法撤销。',
    }
    showDeleteConfirm.value = true
  }

  async function handleConfirmDelete() {
    if (!pendingDelete.value || (!selectedProjectId.value && pendingDelete.value.type !== 'project'))
      return

    const { type, id } = pendingDelete.value
    try {
      if (type === 'project') {
        await projectStore.deleteProject(id)
        if (selectedProjectId.value === id)
          deselectProject()
        toast.add(T.project_deleted, 'success')
      }
      else if (type === 'character') {
        await characterStore.deleteCharacter(selectedProjectId.value!, id)
        toast.add(T.character_deleted, 'success')
      }
      else if (type === 'volume') {
        await volumeStore.deleteVolume(selectedProjectId.value!, id)
        toast.add(T.volume_deleted, 'success')
        await chapterStore.fetchChapters(selectedProjectId.value!)
      }
      else if (type === 'chapter') {
        await chapterStore.deleteChapter(selectedProjectId.value!, id)
        toast.add(T.chapter_deleted, 'success')
      }
    }
    catch {
      toast.add(getErrorMessage('project_delete'), 'error')
    }
    finally {
      showDeleteConfirm.value = false
      pendingDelete.value = null
    }
  }

  // --- Character CRUD ---

  const showCharacterModal = ref(false)
  const editingCharacterId = ref<string | null>(null)
  const charForm = ref<{
    name: string
    role: CharacterRole | ''
    goal: string
    personality: string
  }>({
    name: '',
    role: '',
    goal: '',
    personality: '',
  })

  function openCreateCharacterModal() {
    editingCharacterId.value = null
    charForm.value = { name: '', role: '', goal: '', personality: '' }
    showCharacterModal.value = true
  }

  function openEditCharacterModal(char: any) {
    editingCharacterId.value = char.id
    charForm.value = {
      name: char.name,
      role: char.role || '',
      goal: char.goal || '',
      personality: char.personality || '',
    }
    showCharacterModal.value = true
  }

  async function handleSaveCharacter() {
    if (!selectedProjectId.value || !charForm.value.name.trim())
      return
    try {
      const data = {
        ...charForm.value,
        role: (charForm.value.role || undefined) as CharacterRole | undefined,
      }
      if (editingCharacterId.value) {
        await characterStore.updateCharacter(selectedProjectId.value, editingCharacterId.value, data)
        toast.add(T.character_updated, 'success')
      }
      else {
        await characterStore.createCharacter(selectedProjectId.value, data)
        toast.add(T.character_added, 'success')
      }
      showCharacterModal.value = false
    }
    catch {
      toast.add(getErrorMessage('character_save'), 'error')
    }
  }

  function handleDeleteCharacter(id: string) {
    pendingDelete.value = {
      type: 'character',
      id,
      title: '删除角色',
      description: '确定要删除这个角色吗？此操作无法撤销。',
    }
    showDeleteConfirm.value = true
  }

  // --- Volume CRUD ---

  const showVolumeModal = ref(false)
  const volForm = ref({ title: '', summary: '', orderIndex: '1' })

  function openCreateVolumeModal() {
    volForm.value = { title: '', summary: '', orderIndex: (volumeStore.volumes.length + 1).toString() }
    showVolumeModal.value = true
  }

  async function handleCreateVolume() {
    if (!selectedProjectId.value || !volForm.value.title.trim())
      return
    try {
      await volumeStore.createVolume(selectedProjectId.value, {
        ...volForm.value,
        orderIndex: Number(volForm.value.orderIndex),
      })
      showVolumeModal.value = false
      toast.add(T.volume_created, 'success')
    }
    catch { toast.add(getErrorMessage('volume_add'), 'error') }
  }

  function handleDeleteVolume(id: string) {
    pendingDelete.value = {
      type: 'volume',
      id,
      title: '删除分卷',
      description: '确定要删除这个分卷及其所有章节吗？此操作无法撤销。',
    }
    showDeleteConfirm.value = true
  }

  // --- Chapter CRUD ---

  const showChapterModal = ref(false)
  const chForm = ref({ title: '', chapterNumber: '1', volumeId: '' })

  function openCreateChapterModal() {
    chForm.value = {
      title: '',
      chapterNumber: (chapterStore.chapters.length + 1).toString(),
      volumeId: volumeStore.volumes[0]?.id || '',
    }
    showChapterModal.value = true
  }

  async function handleCreateChapter() {
    if (!selectedProjectId.value || !chForm.value.title.trim())
      return
    try {
      await chapterStore.createChapter(selectedProjectId.value, {
        ...chForm.value,
        chapterNumber: Number(chForm.value.chapterNumber),
      })
      showChapterModal.value = false
      toast.add(T.chapter_created, 'success')
    }
    catch { toast.add(getErrorMessage('chapter_add'), 'error') }
  }

  function handleDeleteChapter(id: string) {
    pendingDelete.value = {
      type: 'chapter',
      id,
      title: '删除章节',
      description: '确定要删除这个章节吗？此操作无法撤销。',
    }
    showDeleteConfirm.value = true
  }

  // --- Story Bible ---

  const showBibleModal = ref(false)
  const bibleForm = ref({ worldview: '', mainConflict: '', theme: '', rules: '', timeline: '' })

  function openEditBibleModal() {
    const b = storyBibleStore.storyBible
    bibleForm.value = {
      worldview: b?.worldview || '',
      mainConflict: b?.mainConflict || '',
      theme: b?.theme || '',
      rules: b?.rules || '',
      timeline: b?.timeline || '',
    }
    showBibleModal.value = true
  }

  async function handleSaveBible() {
    if (!selectedProjectId.value)
      return
    try {
      if (storyBibleStore.storyBible) {
        await storyBibleStore.updateStoryBible(selectedProjectId.value, bibleForm.value)
        toast.add(T.bible_updated, 'success')
      }
      else {
        await storyBibleStore.createStoryBible(selectedProjectId.value, bibleForm.value)
        toast.add(T.bible_created, 'success')
      }
      showBibleModal.value = false
    }
    catch { toast.add(getErrorMessage('bible_save'), 'error') }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString()
  }

  function getVolumesForChapter(volumeId?: string) {
    if (!volumeId)
      return '未归类'
    const vol = volumeStore.volumes.find((v: any) => v.id === volumeId)
    return vol ? vol.title : '未归类'
  }

  return {
    loading,
    selectedProjectId,
    showCreateModal,
    showEditProjectModal,
    createError,
    formTitle,
    formGenre,
    formTheme,
    formTargetWords,
    showDeleteConfirm,
    pendingDelete,
    showCharacterModal,
    editingCharacterId,
    charForm,
    showVolumeModal,
    volForm,
    showChapterModal,
    chForm,
    showBibleModal,
    bibleForm,
    projectStore,
    storyBibleStore,
    characterStore,
    volumeStore,
    chapterStore,
    selectProject,
    deselectProject,
    openCreateModal,
    openEditProjectModal,
    handleCreate,
    handleUpdateProject,
    handleConfirmDelete,
    confirmDelete,
    openCreateCharacterModal,
    openEditCharacterModal,
    handleSaveCharacter,
    handleDeleteCharacter,
    openCreateVolumeModal,
    handleCreateVolume,
    handleDeleteVolume,
    openCreateChapterModal,
    handleCreateChapter,
    handleDeleteChapter,
    openEditBibleModal,
    handleSaveBible,
    formatDate,
    getVolumesForChapter,
  }
}
