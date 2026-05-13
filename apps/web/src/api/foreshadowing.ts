import type { CreateForeshadowingInput, ForeshadowingItem, UpdateForeshadowingInput } from '@ai-novel/shared'
import { createCrudApi } from './client'

const crud = createCrudApi<ForeshadowingItem, CreateForeshadowingInput, UpdateForeshadowingInput>('foreshadowing')

export const fetchForeshadowingItems = crud.fetch
export const createForeshadowingItem = crud.create
export const updateForeshadowingItem = crud.update
export const deleteForeshadowingItem = crud.delete
