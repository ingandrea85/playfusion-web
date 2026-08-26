import { defineConfig } from 'vite'

// Marketing site — served at the domain root (/) behind CloudFront. The app lives at /app.
export default defineConfig({ root: __dirname, base: '/', build: { outDir: 'dist', emptyOutDir: true } })
