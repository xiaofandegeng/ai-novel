import { integer, pgTable, text, vector } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'
import { novelProjects } from './project'

export const knowledgeSources = pgTable('knowledge_sources', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  author: text('author'),
  sourceType: text('source_type').$type<'classic' | 'reference' | 'personal'>().notNull(),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  status: text('status').$type<'pending' | 'processing' | 'completed' | 'failed'>().notNull().default('pending'),
  ...timestamps,
})

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chunkType: text('chunk_type').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  summary: text('summary'),
  techniques: text('techniques'),
  orderIndex: integer('order_index').notNull(),
  importance: integer('importance').notNull().default(5), // 1-10
  lastRetrievedAt: integer('last_retrieved_at'), // timestamp
  createdAt: timestamps.createdAt,
})

export const knowledgeNotes = pgTable('knowledge_notes', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags'),
  createdAt: timestamps.createdAt,
})

export const knowledgeEmbeddings = pgTable('knowledge_embeddings', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  sourceId: text('source_id'),
  chunkId: text('chunk_id'),
  embeddingModel: text('embedding_model').notNull(),
  embeddingVector: vector('embedding_vector', { dimensions: 1536 }),
  contentType: text('content_type').$type<'knowledge_summary' | 'technique' | 'chapter_memory' | 'fact_summary' | 'persona_memory' | 'style_fingerprint'>().notNull(),
  contentHash: text('content_hash').notNull(),
  ...timestamps,
})
