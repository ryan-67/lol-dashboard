import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Root-domain hosting (nucky.gg) — no base path override
export default defineConfig({
  plugins: [react()],
})
