import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  console.log('BUILD ENV CHECK — VITE_SUPABASE_URL:', env.VITE_SUPABASE_URL)
  console.log('BUILD ENV CHECK — VITE_SUPABASE_ANON_KEY set:', !!env.VITE_SUPABASE_ANON_KEY)
  console.log('BUILD ENV CHECK — deploy:', new Date().toISOString())

  return {
    plugins: [react()],
    build: {
      // Don't modulepreload heavy async chunks on every route — Three/charts
      // were being injected into /dashboard HTML and competing with OE bootstrap.
      modulePreload: {
        resolveDependencies(_filename, deps) {
          return deps.filter(
            (dep) => !/three|charts|Landing|CursorTrail|HeroN|KnowsSection/i.test(dep),
          )
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('recharts') || id.includes('d3-')) return 'charts'
            if (id.includes('gsap')) return 'gsap'
            if (id.includes('three') || id.includes('@react-three')) return 'three'
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('lenis')) return 'lenis'
          },
        },
      },
    },
  }
})
