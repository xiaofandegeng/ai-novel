import type { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { userInfo } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { config as loadDotenv } from 'dotenv'
import { parseProjectContentMasterKey } from '../security/project-content-crypto'

type RuntimeEnvironment = NodeJS.ProcessEnv

const DEFAULT_PORT = 3000
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173']

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

export function getServerConfig(env: RuntimeEnvironment = process.env) {
  const port = Number(env.PORT) || DEFAULT_PORT
  const corsOrigins = env.CORS_ORIGINS
    ?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  return {
    port,
    corsOrigins: corsOrigins?.length ? corsOrigins : DEFAULT_CORS_ORIGINS,
  }
}

export function getAIEnvironmentConfig(env: RuntimeEnvironment = process.env) {
  return {
    provider: env.AI_PROVIDER,
    baseUrl: env.AI_BASE_URL,
    model: env.AI_MODEL,
    apiKey: env.AI_API_KEY,
    temperature: env.AI_TEMPERATURE ? Number(env.AI_TEMPERATURE) : undefined,
    embeddingProvider: env.AI_EMBEDDING_PROVIDER,
    embeddingBaseUrl: env.AI_EMBEDDING_BASE_URL,
    embeddingModel: env.AI_EMBEDDING_MODEL,
    embeddingApiKey: env.AI_EMBEDDING_API_KEY || env.AI_API_KEY,
  }
}

export function getCredentialMasterKey(env: RuntimeEnvironment = process.env): string | undefined {
  return env.AI_CREDENTIAL_MASTER_KEY
}

export function getProjectContentMasterKey(env: RuntimeEnvironment = process.env): Buffer {
  return parseProjectContentMasterKey(env.PROJECT_CONTENT_MASTER_KEY)
}

loadEnvironmentFiles()
getProjectContentMasterKey()
