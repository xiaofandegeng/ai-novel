import type { CreateProjectInput, NovelProject, UpdateProjectInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as projectsApi from '../api/projects'

export const useProjectStore = defineStore('projects', () => {
  const projects = ref<NovelProject[]>([])
  const currentProject = ref<NovelProject | null>(null)

  async function fetchProjects(params?: { limit?: number, offset?: number }) {
    const rows = await projectsApi.fetchProjects(params)
    if (params?.offset && params.offset > 0) {
      projects.value = [...projects.value, ...rows]
    }
    else {
      projects.value = rows
    }
    return rows
  }

  async function fetchProject(id: string) {
    currentProject.value = await projectsApi.fetchProject(id)
  }

  async function createProject(data: CreateProjectInput) {
    const project = await projectsApi.createProject(data)
    projects.value.push(project)
    return project
  }

  async function updateProject(id: string, data: UpdateProjectInput) {
    const project = await projectsApi.updateProject(id, data)
    const idx = projects.value.findIndex(p => p.id === id)
    if (idx !== -1)
      projects.value[idx] = project
    if (currentProject.value?.id === id)
      currentProject.value = project
    return project
  }

  async function deleteProject(id: string) {
    await projectsApi.deleteProject(id)
    projects.value = projects.value.filter(p => p.id !== id)
    if (currentProject.value?.id === id)
      currentProject.value = null
  }

  return { projects, currentProject, fetchProjects, fetchProject, createProject, updateProject, deleteProject }
})
