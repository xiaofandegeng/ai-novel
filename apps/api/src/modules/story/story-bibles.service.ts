import type { CreateStoryBibleInput } from '@ai-novel/shared'
import type { StoryStructureCommandOptions } from './story-structure.commands'
import type { StoryBibleSnapshot } from './story-structure.eventing'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { storyBibles } from '../../db/schema'
import { generateId } from '../../shared/utils'
import { compactStoryPayload, dispatchStoryStructureCommand } from './story-structure.commands'
import {
  CHANGE_STORY_BIBLE_COMMAND,
  CREATE_STORY_BIBLE_COMMAND,
} from './story-structure.eventing'

export async function getStoryBible(projectId: string) {
  const [row] = await db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId))
  return row ?? null
}

export async function createStoryBible(
  projectId: string,
  input: CreateStoryBibleInput,
  options: StoryStructureCommandOptions = {},
) {
  const result = await dispatchStoryStructureCommand<StoryBibleSnapshot>(
    CREATE_STORY_BIBLE_COMMAND,
    projectId,
    { id: generateId(), ...compactStoryPayload(input) },
    options,
  )
  return await getStoryBible(projectId) ?? result
}

export async function updateStoryBible(
  projectId: string,
  input: CreateStoryBibleInput,
  options: StoryStructureCommandOptions = {},
) {
  const result = await dispatchStoryStructureCommand<StoryBibleSnapshot>(
    CHANGE_STORY_BIBLE_COMMAND,
    projectId,
    compactStoryPayload(input),
    options,
  )
  return await getStoryBible(projectId) ?? result
}
