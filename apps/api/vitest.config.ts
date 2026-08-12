import { userInfo } from 'node:os'
import process from 'node:process'
import { defineConfig } from 'vitest/config'

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? `postgres://${userInfo().username}@localhost:5432/ai_novel_test`
const databaseName = new URL(databaseUrl).pathname.slice(1)

if (!databaseName.endsWith('_test'))
  throw new Error(`Refusing to run tests against non-test database: ${databaseName}`)

process.env.DATABASE_URL = databaseUrl
process.env.AI_CREDENTIAL_MASTER_KEY ??= 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='
process.env.PROJECT_CONTENT_MASTER_KEY ??= 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk='

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/app.ts',
        'src/config/**/*.ts',
        'src/eventing/**/*.ts',
        'src/modules/**/*.ts',
        'src/shared/**/*.ts',
      ],
      exclude: [
        'src/index.ts',
        'src/eventing/index.ts',
        'src/eventing/**/*.test.ts',
      ],
      thresholds: {
        'statements': 80,
        'branches': 70,
        'functions': 85,
        'lines': 80,
        'src/eventing/**/*.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        'src/modules/automation/**/*.process-manager.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
})
