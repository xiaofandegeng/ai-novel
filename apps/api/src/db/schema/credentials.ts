import { index, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamps } from './_helpers'

export type CredentialKind = 'chat' | 'embedding'

export const credentialVaultEntries = pgTable('credential_vault_entries', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  kind: text('kind').$type<CredentialKind>().notNull(),
  ciphertext: text('ciphertext').notNull(),
  initializationVector: text('initialization_vector').notNull(),
  authenticationTag: text('authentication_tag').notNull(),
  keyVersion: integer('key_version').notNull(),
  maskedSuffix: text('masked_suffix').notNull(),
  ...timestamps,
}, table => [
  index('credential_vault_project_kind_idx').on(table.projectId, table.kind),
])
