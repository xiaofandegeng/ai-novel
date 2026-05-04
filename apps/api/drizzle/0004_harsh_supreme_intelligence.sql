-- Deduplicate existing rows before creating unique index
DELETE FROM chapter_memories a
USING chapter_memories b
WHERE a.project_id = b.project_id
  AND a.chapter_id = b.chapter_id
  AND a.updated_at < b.updated_at;

DELETE FROM chapter_memories a
USING chapter_memories b
WHERE a.project_id = b.project_id
  AND a.chapter_id = b.chapter_id
  AND a.updated_at = b.updated_at
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS "chapter_memories_project_chapter_unique" ON "chapter_memories" USING btree ("project_id","chapter_id");