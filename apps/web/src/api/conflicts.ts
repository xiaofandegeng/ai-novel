import type { Conflict, CreateConflictInput, UpdateConflictInput } from '@ai-novel/shared'
import { createCrudApi } from './client'

const crud = createCrudApi<Conflict, CreateConflictInput, UpdateConflictInput>('conflicts')

export const fetchConflicts = crud.fetch
export const createConflict = crud.create
export const updateConflict = crud.update
export const deleteConflict = crud.delete
