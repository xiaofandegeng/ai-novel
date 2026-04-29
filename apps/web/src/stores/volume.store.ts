import type { CreateVolumeInput, UpdateVolumeInput, Volume } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as volumesApi from '../api/volumes'

export const useVolumeStore = defineStore('volumes', () => {
  const volumes = ref<Volume[]>([])

  async function fetchVolumes(projectId: string) {
    volumes.value = await volumesApi.fetchVolumes(projectId)
  }

  async function createVolume(projectId: string, data: CreateVolumeInput) {
    const v = await volumesApi.createVolume(projectId, data)
    volumes.value.push(v)
    return v
  }

  async function updateVolume(projectId: string, id: string, data: UpdateVolumeInput) {
    const v = await volumesApi.updateVolume(projectId, id, data)
    const idx = volumes.value.findIndex(vol => vol.id === id)
    if (idx !== -1)
      volumes.value[idx] = v
    return v
  }

  async function deleteVolume(projectId: string, id: string) {
    await volumesApi.deleteVolume(projectId, id)
    volumes.value = volumes.value.filter(v => v.id !== id)
  }

  return { volumes, fetchVolumes, createVolume, updateVolume, deleteVolume }
})
