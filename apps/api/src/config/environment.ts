import type { Buffer } from 'node:buffer'
import { Buffer as NodeBuffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { parseProjectContentMasterKey } from '../security/project-content-crypto'
import { loadEnvironmentFiles } from './database-environment'

export { getDatabaseUrl, loadEnvironmentFiles } from './database-environment'

type RuntimeEnvironment = NodeJS.ProcessEnv

const DEFAULT_PORT = 3000
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173']

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
  const projectContentMasterKey = parseProjectContentMasterKey(env.PROJECT_CONTENT_MASTER_KEY)
  const credentialMasterKey = decodeConfiguredCredentialMasterKey(env.AI_CREDENTIAL_MASTER_KEY)
  if (
    credentialMasterKey
    && timingSafeEqual(projectContentMasterKey, credentialMasterKey)
  ) {
    throw new Error('Project content and AI credential master keys must be different')
  }
  return projectContentMasterKey
}

function decodeConfiguredCredentialMasterKey(value: string | undefined): Buffer | null {
  if (!value || !/^[a-z0-9+/]+={0,2}$/i.test(value))
    return null
  const key = NodeBuffer.from(value, 'base64')
  if (key.length !== 32 || key.toString('base64') !== value)
    return null
  return key
}

loadEnvironmentFiles()
getProjectContentMasterKey()
