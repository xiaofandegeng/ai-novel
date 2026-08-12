import type { CreateProjectInput, DeleteProjectResult, UpdateProjectInput } from '@ai-novel/shared'
import type { JsonObject } from '../../eventing'
import type { ProjectSnapshot } from './project.eventing'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { projectReadModels } from '../../db/schema'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import {
  CREATE_PROJECT_COMMAND,
  DELETE_PROJECT_COMMAND,
  PROJECT_AGGREGATE_TYPE,

  UPDATE_PROJECT_COMMAND,
} from './project.eventing'

type CreateProjectPayload = CreateProjectInput & Pick<UpdateProjectInput, 'status'>

export interface ProjectCommandOptions {
  commandId?: string
  correlationId?: string
  projectId?: string
}

export function listProjects(limit: number, offset: number) {
  return db.select().from(projectReadModels).limit(limit).offset(offset)
}

export async function getProject(id: string) {
  const [row] = await db.select().from(projectReadModels).where(eq(projectReadModels.id, id))
  return row ?? null
}

export async function createProject(
  input: CreateProjectPayload,
  options: ProjectCommandOptions = {},
) {
  const projectId = options.projectId ?? generateId()
  const result = await commandBus.dispatch<ProjectSnapshot>(projectCommand(
    CREATE_PROJECT_COMMAND,
    projectId,
    compactPayload(input),
    options,
  ))
  return await getProject(result.id) ?? result
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  options: ProjectCommandOptions = {},
) {
  const result = await commandBus.dispatch<ProjectSnapshot>(projectCommand(
    UPDATE_PROJECT_COMMAND,
    id,
    compactPayload(input),
    options,
  ))
  return await getProject(result.id) ?? result
}

export function deleteProject(id: string, options: ProjectCommandOptions = {}) {
  return commandBus.dispatch<DeleteProjectResult>(projectCommand(
    DELETE_PROJECT_COMMAND,
    id,
    {},
    options,
  ))
}

function projectCommand(
  commandType: string,
  projectId: string,
  payload: JsonObject,
  options: ProjectCommandOptions,
) {
  const commandId = options.commandId ?? generateId()
  return {
    commandId,
    commandType,
    aggregateType: PROJECT_AGGREGATE_TYPE,
    aggregateId: projectId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    payload,
  }
}

function compactPayload(input: object): JsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  )
}
