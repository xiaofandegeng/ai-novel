import type { Chapter, Character, NovelProject, StoryBible, Volume } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/useApi'

export const useProjectStore = defineStore('projects', () => {
  const { get, post, patch, del } = useApi()
  const projects = ref<NovelProject[]>([])
  const currentProject = ref<NovelProject | null>(null)

  async function fetchProjects() {
    projects.value = await get<NovelProject[]>('/api/projects')
  }

  async function fetchProject(id: string) {
    currentProject.value = await get<NovelProject>(`/api/projects/${id}`)
  }

  async function createProject(data: Partial<NovelProject>) {
    const project = await post<NovelProject>('/api/projects', data)
    projects.value.push(project)
    return project
  }

  async function updateProject(id: string, data: Partial<NovelProject>) {
    const project = await patch<NovelProject>(`/api/projects/${id}`, data)
    const idx = projects.value.findIndex(p => p.id === id)
    if (idx !== -1)
      projects.value[idx] = project
    if (currentProject.value?.id === id)
      currentProject.value = project
    return project
  }

  async function deleteProject(id: string) {
    await del(`/api/projects/${id}`)
    projects.value = projects.value.filter(p => p.id !== id)
    if (currentProject.value?.id === id)
      currentProject.value = null
  }

  return { projects, currentProject, fetchProjects, fetchProject, createProject, updateProject, deleteProject }
})

export const useStoryBibleStore = defineStore('storyBible', () => {
  const { get, post, patch } = useApi()
  const storyBible = ref<StoryBible | null>(null)

  async function fetchStoryBible(projectId: string) {
    try {
      storyBible.value = await get<StoryBible>(`/api/projects/${projectId}/story-bible`)
    }
    catch {
      storyBible.value = null
    }
  }

  async function createStoryBible(projectId: string, data: Partial<StoryBible>) {
    storyBible.value = await post<StoryBible>(`/api/projects/${projectId}/story-bible`, data)
    return storyBible.value
  }

  async function updateStoryBible(projectId: string, data: Partial<StoryBible>) {
    storyBible.value = await patch<StoryBible>(`/api/projects/${projectId}/story-bible`, data)
    return storyBible.value
  }

  return { storyBible, fetchStoryBible, createStoryBible, updateStoryBible }
})

export const useCharacterStore = defineStore('characters', () => {
  const { get, post, patch, del } = useApi()
  const characters = ref<Character[]>([])

  async function fetchCharacters(projectId: string) {
    characters.value = await get<Character[]>(`/api/projects/${projectId}/characters`)
  }

  async function createCharacter(projectId: string, data: Partial<Character>) {
    const c = await post<Character>(`/api/projects/${projectId}/characters`, data)
    characters.value.push(c)
    return c
  }

  async function updateCharacter(projectId: string, id: string, data: Partial<Character>) {
    const c = await patch<Character>(`/api/projects/${projectId}/characters/${id}`, data)
    const idx = characters.value.findIndex(ch => ch.id === id)
    if (idx !== -1)
      characters.value[idx] = c
    return c
  }

  async function deleteCharacter(projectId: string, id: string) {
    await del(`/api/projects/${projectId}/characters/${id}`)
    characters.value = characters.value.filter(c => c.id !== id)
  }

  return { characters, fetchCharacters, createCharacter, updateCharacter, deleteCharacter }
})

export const useVolumeStore = defineStore('volumes', () => {
  const { get, post, patch, del } = useApi()
  const volumes = ref<Volume[]>([])

  async function fetchVolumes(projectId: string) {
    volumes.value = await get<Volume[]>(`/api/projects/${projectId}/volumes`)
  }

  async function createVolume(projectId: string, data: Partial<Volume>) {
    const v = await post<Volume>(`/api/projects/${projectId}/volumes`, data)
    volumes.value.push(v)
    return v
  }

  async function updateVolume(projectId: string, id: string, data: Partial<Volume>) {
    const v = await patch<Volume>(`/api/projects/${projectId}/volumes/${id}`, data)
    const idx = volumes.value.findIndex(vol => vol.id === id)
    if (idx !== -1)
      volumes.value[idx] = v
    return v
  }

  async function deleteVolume(projectId: string, id: string) {
    await del(`/api/projects/${projectId}/volumes/${id}`)
    volumes.value = volumes.value.filter(v => v.id !== id)
  }

  return { volumes, fetchVolumes, createVolume, updateVolume, deleteVolume }
})

export const useChapterStore = defineStore('chapters', () => {
  const { get, post, patch, del } = useApi()
  const chapters = ref<Chapter[]>([])

  async function fetchChapters(projectId: string) {
    chapters.value = await get<Chapter[]>(`/api/projects/${projectId}/chapters`)
  }

  async function createChapter(projectId: string, data: Partial<Chapter>) {
    const ch = await post<Chapter>(`/api/projects/${projectId}/chapters`, data)
    chapters.value.push(ch)
    return ch
  }

  async function updateChapter(projectId: string, id: string, data: Partial<Chapter>) {
    const ch = await patch<Chapter>(`/api/projects/${projectId}/chapters/${id}`, data)
    const idx = chapters.value.findIndex(c => c.id === id)
    if (idx !== -1)
      chapters.value[idx] = ch
    return ch
  }

  async function deleteChapter(projectId: string, id: string) {
    await del(`/api/projects/${projectId}/chapters/${id}`)
    chapters.value = chapters.value.filter(c => c.id !== id)
  }

  return { chapters, fetchChapters, createChapter, updateChapter, deleteChapter }
})

export const useRelationshipStore = defineStore('relationships', () => {
  const { get, post, patch, del } = useApi()
  const relationships = ref<any[]>([])

  async function fetchRelationships(projectId: string) {
    relationships.value = await get<any[]>(`/api/projects/${projectId}/relationships`)
  }

  async function createRelationship(projectId: string, data: any) {
    const rel = await post<any>(`/api/projects/${projectId}/relationships`, data)
    relationships.value.push(rel)
    return rel
  }

  async function updateRelationship(projectId: string, id: string, data: any) {
    const rel = await patch<any>(`/api/projects/${projectId}/relationships/${id}`, data)
    const idx = relationships.value.findIndex(r => r.id === id)
    if (idx !== -1)
      relationships.value[idx] = rel
    return rel
  }

  async function deleteRelationship(projectId: string, id: string) {
    await del(`/api/projects/${projectId}/relationships/${id}`)
    relationships.value = relationships.value.filter(r => r.id !== id)
  }

  return { relationships, fetchRelationships, createRelationship, updateRelationship, deleteRelationship }
})

export const useVersionStore = defineStore('versions', () => {
  const { get, post, del } = useApi()
  const versions = ref<any[]>([])

  async function fetchVersions(projectId: string, chapterId: string) {
    versions.value = await get<any[]>(`/api/projects/${projectId}/chapters/${chapterId}/versions`)
  }

  async function createSnapshot(projectId: string, chapterId: string, content: string, note?: string) {
    const v = await post<any>(`/api/projects/${projectId}/chapters/${chapterId}/versions`, { content, note })
    versions.value.unshift(v)
    return v
  }

  async function deleteVersion(projectId: string, id: string) {
    await del(`/api/projects/${projectId}/versions/${id}`)
    versions.value = versions.value.filter(v => v.id !== id)
  }

  return { versions, fetchVersions, createSnapshot, deleteVersion }
})

export const useConflictStore = defineStore('conflicts', () => {
  const { get, post, patch, del } = useApi()
  const conflicts = ref<any[]>([])

  async function fetchConflicts(projectId: string) {
    conflicts.value = await get<any[]>(`/api/projects/${projectId}/conflicts`)
  }

  async function createConflict(projectId: string, data: any) {
    const c = await post<any>(`/api/projects/${projectId}/conflicts`, data)
    conflicts.value.push(c)
    return c
  }

  async function updateConflict(projectId: string, id: string, data: any) {
    const c = await patch<any>(`/api/projects/${projectId}/conflicts/${id}`, data)
    const idx = conflicts.value.findIndex(con => con.id === id)
    if (idx !== -1)
      conflicts.value[idx] = c
    return c
  }

  async function deleteConflict(projectId: string, id: string) {
    await del(`/api/projects/${projectId}/conflicts/${id}`)
    conflicts.value = conflicts.value.filter(c => c.id !== id)
  }

  return { conflicts, fetchConflicts, createConflict, updateConflict, deleteConflict }
})
