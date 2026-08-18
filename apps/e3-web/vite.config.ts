import { defineConfig } from 'vite'

// E3 public SPA — served under /e3/ behind CloudFront (path-based routing to apps).
export default defineConfig({ root: __dirname, base: '/e3/', build: { outDir: 'dist', emptyOutDir: true } })
