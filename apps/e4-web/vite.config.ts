import { defineConfig } from 'vite'

// E4 platform-admin SPA — served under /e4/ behind CloudFront (path-based routing to apps).
export default defineConfig({ root: __dirname, base: '/e4/', build: { outDir: 'dist', emptyOutDir: true } })
