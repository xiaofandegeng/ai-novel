import type { CreateVolumeInput, UpdateVolumeInput, Volume } from '@ai-novel/shared'
import { createCrudApi } from './client'

const crud = createCrudApi<Volume, CreateVolumeInput, UpdateVolumeInput>('volumes')

export const fetchVolumes = crud.fetch
export const createVolume = crud.create
export const updateVolume = crud.update
export const deleteVolume = crud.delete
