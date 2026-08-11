import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [Vue()],
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/index.ts', 'src/components/index.ts', 'src/**/*.d.ts', 'src/types.ts', 'src/tokens.ts'],
      thresholds: {
        statements: 85,
        branches: 50,
        functions: 85,
        lines: 85,
      },
    },
  },
})
