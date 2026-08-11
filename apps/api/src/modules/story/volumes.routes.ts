import type { CreateVolumeInput, UpdateVolumeInput } from '@ai-novel/shared'
import type { Context, Hono } from 'hono'
import { DomainCommandError } from '../../eventing'
import { httpCommandOptions } from '../../shared/http/command-options'
import { fail, success } from '../../shared/http/responses'
import { CHANGE_VOLUME_COMMAND, CREATE_VOLUME_COMMAND, DELETE_VOLUME_COMMAND } from './story-structure.eventing'
import { createVolume, deleteVolume, getVolume, listVolumes, updateVolume } from './volumes.service'

export function registerVolumeRoutes(app: Hono) {
  app.get('/api/projects/:projectId/volumes', async (c) => {
    return c.json(success(await listVolumes(c.req.param('projectId'))))
  })

  app.get('/api/projects/:projectId/volumes/:id', async (c) => {
    const row = await getVolume(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row)) : c.json(fail('Volume not found'), 404)
  })

  app.post('/api/projects/:projectId/volumes', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const row = await createVolume(
        projectId,
        await c.req.json<CreateVolumeInput>(),
        httpCommandOptions(c, CREATE_VOLUME_COMMAND, projectId),
      )
      return c.json(success(row), 201)
    }
    catch (error: unknown) {
      return volumeFailure(c, error)
    }
  })

  app.patch('/api/projects/:projectId/volumes/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    try {
      const row = await updateVolume(
        projectId,
        id,
        await c.req.json<UpdateVolumeInput>(),
        httpCommandOptions(c, CHANGE_VOLUME_COMMAND, projectId, id),
      )
      return c.json(success(row))
    }
    catch (error: unknown) {
      return volumeFailure(c, error)
    }
  })

  app.delete('/api/projects/:projectId/volumes/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    try {
      const row = await deleteVolume(
        projectId,
        id,
        httpCommandOptions(c, DELETE_VOLUME_COMMAND, projectId, id),
      )
      return c.json(success(row, 'Volume deleted'))
    }
    catch (error: unknown) {
      return volumeFailure(c, error)
    }
  })
}

function volumeFailure(c: Context, error: unknown): Response {
  if (!(error instanceof DomainCommandError))
    throw error
  if (error.code === 'VOLUME_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND')
    return c.json(fail(error.message), 404)
  return c.json(fail(error.message), 400)
}
