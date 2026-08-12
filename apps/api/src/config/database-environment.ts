import { existsSync } from 'node:fs'
import { userInfo } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { config as loadDotenv } from 'dotenv'

type RuntimeEnvironment = NodeJS.ProcessEnv

let environmentLoaded = false

export function loadEnvironmentFiles(cwd = process.cwd()) {
  if (environmentLoaded)
    return

  const candidates = new Set([
    resolve(cwd, '.env'),
    resolve(cwd, '../../.env'),
  ])

  for (const envPath of candidates) {
    if (existsSync(envPath))
      loadDotenv({ path: envPath, override: false })
  }

  environmentLoaded = true
}

export function getDatabaseUrl(env: RuntimeEnvironment = process.env): string {
  return env.DATABASE_URL || `postgres://${userInfo().username}@localhost:5432/ai_novel`
}

loadEnvironmentFiles()
