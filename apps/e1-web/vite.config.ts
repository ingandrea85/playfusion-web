import { defineConfig } from 'vite'

// E1 organizer SPA — served under /e1/ behind CloudFront (path-based routing to apps).
export default defineConfig({ root: __dirname, base: '/e1/', build: { outDir: 'dist', emptyOutDir: true } })
