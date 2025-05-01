// import path from 'path';

/** @type {import('tailwindcss').Config} */

// Log the CWD to diagnose path issues
//console.log('[tailwind.config.js] CWD:', process.cwd());

export default {
  content: [
    './index.html', 
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        textPrimary: 'rgb(var(--color-textPrimary) / <alpha-value>)',
        textSecondary: 'rgb(var(--color-textSecondary) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
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