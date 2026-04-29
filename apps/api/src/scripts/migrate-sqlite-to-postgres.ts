import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { db, sql } from '../db'
import {
  chapters,
  chapterVersions,
  characterRelationships,
  characters,
  conflicts,
  knowledgeChunks,
  knowledgeNotes,
  knowledgeSources,
  novelProjects,
  qualityReports,
  storyBibles,
  volumes,
} from '../db/schema'

type Row = Record<string, unknown>

const sqlitePath = process.env.SQLITE_DATABASE_PATH || './data/ai-novel.db'

interface MigrationTable {
  sqlite: string
  pg: unknown
  map: (row: Row) => Row
}

const tableOrder: MigrationTable[] = [
  {
    sqlite: 'novel_projects',
    pg: novelProjects,
    map: (row: Row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      genre: row.genre,
      theme: row.theme,
      targetWords: row.target_words,
      targetAudience: row.target_audience,
      styleProfile: row.style_profile,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  {
    sqlite: 'story_bibles',
    pg: storyBibles,
    map: (row: Row) => ({
      id: row.id,
      projectId: row.project_id,
      worldview: row.worldview,
      mainConflict: row.main_conflict,
      theme: row.theme,
      rules: row.rules,
      timeline: row.timeline,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  {
    sqlite: 'characters',
    pg: characters,
    map: (row: Row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      role: row.role,
      goal: row.goal,
      fear: row.fear,
      secret: row.secret,
      desire: row.desire,
      weakness: row.weakness,
      personality: row.personality,
      arc: row.arc,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  {
    sqlite: 'volumes',
    pg: volumes,
    map: (row: Row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      summary: row.summary,
      orderIndex: row.order_index,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  {
    sqlite: 'chapters',
    pg: chapters,
    map: (row: Row) => ({
      id: row.id,
      projectId: row.project_id,
      volumeId: row.volume_id,
      title: row.title,
      chapterNumber: row.chapter_number,
      outline: row.outline,
      summary: row.summary,
      characters: row.characters,
      goals: row.goals,
      conflicts: row.conflicts,
      events: row.events,
      emotionalArc: row.emotional_arc,
      foreshadowing: row.foreshadowing,
      endingHook: row.ending_hook,
      draft: row.draft,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  {
    sqlite: 'character_relationships',
    pg: characterRelationships,
    map: (row: Row) => ({
      id: row.id,
      projectId: row.project_id,
      characterAId: row.character_a_id,
      characterBId: row.character_b_id,
      type: row.type,
      strength: row.strength,
      status: row.status,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  {
    sqlite: 'conflicts',
    pg: conflicts,
    map: (row: Row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      type: row.type,
      intensity: row.intensity,
      status: row.status,
      participants: row.participants,
      description: row.description,
      resolution: row.resolution,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  {
    sqlite: 'chapter_versions',
    pg: chapterVersions,
    map: (row: Row) => ({
      id: row.id,
      projectId: row.project_id,
      chapterId: row.chapter_id,
      content: row.content,
      wordCount: row.word_count,
      note: row.note,
      createdAt: row.created_at,
    }),
  },
  {
    sqlite: 'knowledge_sources',
    pg: knowledgeSources,
    map: (row: Row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      author: row.author,
      sourceType: row.source_type,
      fileName: row.file_name,
      fileSize: row.file_size,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  {
    sqlite: 'knowledge_chunks',
    pg: knowledgeChunks,
    map: (row: Row) => ({
      id: row.id,
      sourceId: row.source_id,
      projectId: row.project_id,
      chunkType: row.chunk_type,
      title: row.title,
      content: row.content,
      summary: row.summary,
      techniques: row.techniques,
      orderIndex: row.order_index,
      createdAt: row.created_at,
    }),
  },
  {
    sqlite: 'knowledge_notes',
    pg: knowledgeNotes,
    map: (row: Row) => ({
      id: row.id,
      sourceId: row.source_id,
      projectId: row.project_id,
      title: row.title,
      content: row.content,
      tags: row.tags,
      createdAt: row.created_at,
    }),
  },
  {
    sqlite: 'quality_reports',
    pg: qualityReports,
    map: (row: Row) => ({
      id: row.id,
      projectId: row.project_id,
      chapterId: row.chapter_id,
      scope: row.scope,
      score: row.score,
      rhythmScore: row.rhythm_score,
      conflictScore: row.conflict_score,
      logicScore: row.logic_score,
      characterScore: row.character_score,
      styleScore: row.style_score,
      issues: row.issues,
      suggestions: row.suggestions,
      createdAt: row.created_at,
    }),
  },
]

function readSqliteRows(table: string): Row[] {
  const output = execFileSync('sqlite3', [sqlitePath, '-json', `select * from ${table}`], {
    encoding: 'utf8',
  })
  return JSON.parse(output || '[]') as Row[]
}

async function insertRows(table: unknown, rows: Row[]) {
  if (rows.length === 0)
    return
  await db.insert(table as never).values(rows as never)
}

async function migrate() {
  for (const table of [...tableOrder].reverse()) {
    await db.delete(table.pg as never)
  }

  for (const table of tableOrder) {
    const rows = readSqliteRows(table.sqlite).map(table.map)
    await insertRows(table.pg, rows)
    console.log(`Migrated ${rows.length} rows from ${table.sqlite}`)
  }
}

migrate().then(async () => {
  await sql.end()
}).catch(async (error) => {
  console.error('SQLite to PostgreSQL migration failed:', error)
  await sql.end()
  process.exit(1)
})
