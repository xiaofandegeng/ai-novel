import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'app',
    vue: true,
    typescript: true,
    unocss: {
      files: 'apps/web/uno.config.ts',
    },
    ignores: ['**/dist', '**/.output', '**/drizzle', 'docs/**/*.md'],
    stylistic: {
      indent: 2,
      quotes: 'single',
    },
    formatters: {
      css: true,
      html: true,
      markdown: true,
    },
  },
)
