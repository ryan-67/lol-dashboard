/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        subtle: 'var(--border-subtle)',
        focus: 'var(--border-focus)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',
        accent: 'var(--accent)',
        'accent-dim': 'var(--accent-dim)',
        'accent-bg': 'var(--accent-bg)',
      },
      fontFamily: {
        sans: ['"Noto Sans Mono"', 'monospace'],
        mono: ['"Noto Sans Mono"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0',
        none: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '0',
      },
      boxShadow: {
        DEFAULT: 'none',
        none: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
      },
      maxWidth: {
        shell: 'var(--max-width)',
      },
    },
  },
  plugins: [],
}
