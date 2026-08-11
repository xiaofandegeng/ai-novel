import { sql } from '../db'

export async function resetTestDatabase() {
  const tables = await sql<{ tablename: string }[]>`
    select tablename
    from pg_tables
    where schemaname = 'public'
  `
  const names = tables
    .map(row => row.tablename)
    .filter(name => /^\w+$/.test(name))

  if (names.length > 0) {
    const quoted = names.map(name => `"${name}"`).join(', ')
    await sql.unsafe(`truncate table ${quoted} restart identity cascade`)
  }
}
