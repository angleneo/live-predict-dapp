import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#08090d',
          soft: '#0e1117',
          card: '#131722',
          hover: '#1b2030',
        },
        line: '#232a3b',
        brand: {
          DEFAULT: '#7c5cff',
          soft: '#9d86ff',
          deep: '#5b3dd6',
        },
        bull: '#0ecb81',
        bear: '#f6465d',
        muted: '#8b93a7',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'flash-up': {
          '0%': { backgroundColor: 'rgba(14,203,129,0.28)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'flash-down': {
          '0%': { backgroundColor: 'rgba(246,70,93,0.28)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        'pulse-live': 'pulse-live 1.4s ease-in-out infinite',
        'flash-up': 'flash-up 480ms ease-out',
        'flash-down': 'flash-down 480ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
