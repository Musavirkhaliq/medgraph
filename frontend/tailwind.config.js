/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#0B0F19',
          surface: '#111827',
          elevated: '#1E293B',
          card: 'rgba(17, 24, 39, 0.75)',
        },
        med: {
          cyan: '#06B6D4',
          'cyan-hover': '#0891B2',
          'cyan-dim': 'rgba(6, 182, 212, 0.15)',
          teal: '#14B8A6',
          indigo: '#6366F1',
          'indigo-dim': 'rgba(99, 102, 241, 0.15)',
          emerald: '#10B981',
          'emerald-dim': 'rgba(16, 185, 129, 0.15)',
          amber: '#F59E0B',
          'amber-dim': 'rgba(245, 158, 11, 0.15)',
          rose: '#F43F5E',
          'rose-dim': 'rgba(244, 63, 94, 0.15)',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.08)',
          strong: 'rgba(255, 255, 255, 0.16)',
          accent: 'rgba(6, 182, 212, 0.35)',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glow-cyan': '0 0 24px -4px rgba(6, 182, 212, 0.35)',
        'glow-indigo': '0 0 24px -4px rgba(99, 102, 241, 0.35)',
        'glow-emerald': '0 0 24px -4px rgba(16, 185, 129, 0.35)',
        'glow-rose': '0 0 24px -4px rgba(244, 63, 94, 0.35)',
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
