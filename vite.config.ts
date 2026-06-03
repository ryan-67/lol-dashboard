import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  console.log('BUILD ENV CHECK — VITE_SUPABASE_URL:', env.VITE_SUPABASE_URL)
  console.log('BUILD ENV CHECK — VITE_SUPABASE_ANON_KEY set:', !!env.VITE_SUPABASE_ANON_KEY)
  console.log('BUILD ENV CHECK — deploy:', new Date().toISOString())

  return {
    plugins: [react()],
  }
})

