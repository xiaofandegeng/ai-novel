const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const DEVELOPMENT_DATABASE_NAMES = new Set(['ai_novel', 'ai_novel_dev', 'ai_novel_development'])

export interface DevelopmentDatabaseTarget {
  databaseName: string
  hostname: string
  url: URL
}

export function assertDevelopmentDatabaseTarget(databaseUrl: string): DevelopmentDatabaseTarget {
  let url: URL
  try {
    url = new URL(databaseUrl)
  }
  catch {
    throw new Error('Refusing to rebuild database: DATABASE_URL is invalid')
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error(`Refusing to rebuild database: unsupported protocol ${url.protocol}`)
  if (!LOCAL_DATABASE_HOSTS.has(url.hostname))
    throw new Error(`Refusing to rebuild database: host ${url.hostname} is not local`)
  if (!DEVELOPMENT_DATABASE_NAMES.has(databaseName))
    throw new Error(`Refusing to rebuild database: ${databaseName || '<empty>'} is not an approved development database`)

  return { databaseName, hostname: url.hostname, url }
}
