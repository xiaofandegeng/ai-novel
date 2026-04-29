import { defineConfig, presetIcons, presetWind, transformerDirectives, transformerVariantGroup } from 'unocss'

export default defineConfig({
  content: {
    pipeline: {
      include: [
        '../../packages/ui/src/**/*.{vue,ts}',
        './src/**/*.{vue,ts,html}',
      ],
    },
  },
  presets: [
    presetWind(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  theme: {
    colors: {
      bg: {
        page: '#F7F8FA',
        surface: '#FFFFFF',
        subtle: '#F1F5F4',
        muted: '#E6ECEB',
      },
      text: {
        primary: '#1F2933',
        secondary: '#52616B',
        muted: '#7B8794',
        inverse: '#FFFFFF',
      },
      border: {
        light: '#DDE5E8',
        DEFAULT: '#C9D5DA',
        strong: '#99AAB2',
      },
      primary: {
        DEFAULT: '#1F6F78',
        hover: '#195C64',
        active: '#124951',
        soft: '#E3F1F2',
      },
      accent: {
        DEFAULT: '#9B6A2F',
        soft: '#F2E8D7',
      },
      semantic: {
        success: '#2F7D5F',
        warning: '#A76D18',
        error: '#BA3F3A',
        info: '#2D6F9F',
      },
      ai: {
        DEFAULT: '#6B4FA3',
        soft: '#EEE9F8',
      },
    },
    fontSize: {
      'xs': ['12px', { 'line-height': '16px' }],
      'sm': ['14px', { 'line-height': '20px' }],
      'base': ['16px', { 'line-height': '24px' }],
      'lg': ['18px', { 'line-height': '28px' }],
      'xl': ['20px', { 'line-height': '28px' }],
      '2xl': ['24px', { 'line-height': '32px' }],
      '3xl': ['32px', { 'line-height': '40px' }],
    },
    fontFamily: {
      sans: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
      writing: '"LXGW WenKai", "Noto Serif SC", "Songti SC", serif',
    },
    borderRadius: {
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '12px',
    },
    boxShadow: {
      sm: '0 1px 2px rgba(31, 41, 51, 0.06)',
      md: '0 10px 30px rgba(31, 41, 51, 0.08)',
      lg: '0 24px 60px rgba(31, 41, 51, 0.14)',
    },
  },
  shortcuts: {
    'bg-page': 'bg-bg-page',
    'bg-surface': 'bg-bg-surface',
    'text-heading': 'text-text-primary font-semibold',
    'text-body': 'text-text-secondary',
    'text-caption': 'text-text-muted text-sm',
    'border-panel': 'border border-border-light',
    'shadow-panel': 'shadow-sm',
  },
})
