import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { sql } from '../db'
import { ProjectionReplay } from '../eventing'
import { eventStore, projectionRegistry } from '../eventing-runtime'

export async function replayProjections(args = process.argv.slice(2)) {
  const options = parseReplayArguments(args)
  const replay = new ProjectionReplay(projectionRegistry, eventStore)
  if (options.name)
    return [await replay.replayProjection(options.name, { projectId: options.projectId })]
  return replay.replayAll({ projectId: options.projectId })
}

function parseReplayArguments(args: string[]) {
  let name: string | undefined
  let projectId: string | undefined
  for (let index = 0; index < args.length; index++) {
    const value = args[index]
    if (value === '--all')
      continue
    if (value === '--name') {
      name = args[++index]
      if (!name)
        throw new Error('--name requires a projection name')
      continue
    }
    if (value === '--project') {
      projectId = args[++index]
      if (!projectId)
        throw new Error('--project requires a project ID')
      continue
    }
    throw new Error(`Unknown replay argument: ${value}`)
  }
  return { name, projectId }
}

async function runReplayCli() {
  const results = await replayProjections()
  for (const result of results)
    console.log(`${result.projectionName}: ${result.processedEvents} events, position ${result.lastGlobalPosition}`)
  await sql.end()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReplayCli().catch(async (error) => {
    console.error('Projection replay failed:', error)
    await sql.end()
    process.exitCode = 1
  })
}
