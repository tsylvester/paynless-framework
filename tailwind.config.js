/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        textPrimary: 'var(--color-textPrimary)',
        textSecondary: 'var(--color-textSecondary)',
        border: 'var(--color-border)',
      },
      ringWidth: {
        DEFAULT: '3px',
      },
      ringColor: {
        DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
      },
      ringOpacity: {
        DEFAULT: '0.2',
        '20': '0.2',
      },
      ringOffsetWidth: {
        DEFAULT: '2px',
      },
      ringOffsetColor: {
        DEFAULT: 'var(--color-background)',
      },
    },
  },
  plugins: [],
};