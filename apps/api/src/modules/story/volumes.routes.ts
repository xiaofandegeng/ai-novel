import type { CreateVolumeInput, UpdateVolumeInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
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
    const row = await createVolume(c.req.param('projectId'), await c.req.json<CreateVolumeInput>())
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/volumes/:id', async (c) => {
    const row = await updateVolume(
      c.req.param('projectId'),
      c.req.param('id'),
      await c.req.json<UpdateVolumeInput>(),
    )
    return row ? c.json(success(row)) : c.json(fail('Volume not found'), 404)
  })

  app.delete('/api/projects/:projectId/volumes/:id', async (c) => {
    const row = await deleteVolume(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row, 'Volume deleted')) : c.json(fail('Volume not found'), 404)
  })
}
