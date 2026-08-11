import { userInfo } from 'node:os'
import process from 'node:process'
import { defineConfig } from 'vitest/config'

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? `postgres://${userInfo().username}@localhost:5432/ai_novel_test`
const databaseName = new URL(databaseUrl).pathname.slice(1)

if (!databaseName.endsWith('_test'))
  throw new Error(`Refusing to run tests against non-test database: ${databaseName}`)

process.env.DATABASE_URL = databaseUrl

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/{app,utils,routes,services}/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        statements: 30,
        branches: 50,
        functions: 45,
        lines: 30,
      },
    },
  },
})
