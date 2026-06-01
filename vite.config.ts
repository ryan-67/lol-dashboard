console.log('BUILD ENV CHECK — URL:', process.env.VITE_SUPABASE_URL)
console.log('BUILD ENV CHECK — KEY exists:', !!process.env.VITE_SUPABASE_ANON_KEY)
console.log('BUILD ENV CHECK — KEY length:', process.env.VITE_SUPABASE_ANON_KEY?.length || 0)
console.log('BUILD ENV CHECK — rebuild probe:', new Date().toISOString())

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Root-domain hosting (nucky.gg) — no base path override
export default defineConfig({
  plugins: [react()],
})
