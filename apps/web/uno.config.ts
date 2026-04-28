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
        page: '#F6F5F1',
        surface: '#FFFFFF',
        subtle: '#F0EFEA',
        muted: '#E8E5DD',
      },
      text: {
        primary: '#23211D',
        secondary: '#5F5A50',
        muted: '#8A8377',
        inverse: '#FFFFFF',
      },
      border: {
        light: '#E2DED6',
        DEFAULT: '#D3CDC2',
        strong: '#B8B0A2',
      },
      primary: {
        DEFAULT: '#24556F',
        hover: '#1D465B',
        active: '#17384A',
        soft: '#E5EEF2',
      },
      accent: {
        DEFAULT: '#B8822F',
        soft: '#F3E8D2',
      },
      semantic: {
        success: '#2F6B4F',
        warning: '#9A6A16',
        error: '#B33A32',
        info: '#2F5F89',
      },
      ai: {
        DEFAULT: '#5B4A8B',
        soft: '#EAE6F5',
      },
    },
    fontSize: {
      'xs': ['12px', { lineHeight: '16px' }],
      'sm': ['14px', { lineHeight: '20px' }],
      'base': ['16px', { lineHeight: '24px' }],
      'lg': ['18px', { lineHeight: '28px' }],
      'xl': ['20px', { lineHeight: '28px' }],
      '2xl': ['24px', { lineHeight: '32px' }],
      '3xl': ['32px', { lineHeight: '40px' }],
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
      sm: '0 1px 2px rgba(35, 33, 29, 0.06)',
      md: '0 8px 24px rgba(35, 33, 29, 0.08)',
      lg: '0 20px 48px rgba(35, 33, 29, 0.14)',
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
