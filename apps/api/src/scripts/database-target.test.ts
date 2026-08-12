import { describe, expect, it } from 'vitest'
import { assertDevelopmentDatabaseTarget } from './database-target'

describe('database rebuild target guard', () => {
  it.each([
    'postgres://localhost/ai_novel',
    'postgres://localhost/ai_novel_dev',
    'postgres://localhost/ai_novel_development',
  ])('accepts an explicit local development database: %s', (url) => {
    expect(assertDevelopmentDatabaseTarget(url)).toMatchObject({ hostname: 'localhost' })
  })

  it.each([
    'postgres://db.example.com/ai_novel',
    'postgres://localhost/ai_novel_test',
    'postgres://localhost/production',
    'postgres://localhost/postgres',
  ])('rejects an unsafe rebuild target: %s', (url) => {
    expect(() => assertDevelopmentDatabaseTarget(url)).toThrow('Refusing to rebuild database')
  })
})
