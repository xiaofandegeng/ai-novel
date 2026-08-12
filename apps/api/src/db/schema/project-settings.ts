import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'

export const projectAISettings = pgTable('project_ai_settings', {
  projectId: text('project_id').primaryKey(),
  provider: text('provider').notNull(),
  baseUrl: text('base_url').notNull(),
  model: text('model').notNull(),
  temperature: integer('temperature').notNull(),
  credentialRef: text('credential_ref'),
  credentialSuffix: text('credential_suffix'),
  embeddingProvider: text('embedding_provider').notNull(),
  embeddingBaseUrl: text('embedding_base_url').notNull(),
  embeddingModel: text('embedding_model').notNull(),
  embeddingCredentialRef: text('embedding_credential_ref'),
  embeddingCredentialSuffix: text('embedding_credential_suffix'),
  embeddingEnabled: boolean('embedding_enabled').notNull(),
  ...timestamps,
})
