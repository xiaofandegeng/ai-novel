import { eq } from 'drizzle-orm'
import { db } from '../db'
import { characters } from '../db/schema'

/**
 * 从文本中匹配项目内的角色 ID
 */
export async function matchCharacterIdsFromText(projectId: string, text: string | null): Promise<string[] | null> {
  if (!text)
    return null

  const allCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))
  const matchedIds = new Set<string>()

  // 简单的正则分词匹配
  const names = text.split(/[，,、\s]+/)
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed)
      continue

    // 优先全名匹配，其次包含匹配
    const found = allCharacters.find((c: any) => c.name === trimmed || trimmed.includes(c.name))
    if (found)
      matchedIds.add(found.id)
  }

  return matchedIds.size > 0 ? Array.from(matchedIds) : null
}
