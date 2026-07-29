import { defineConfig } from 'vite';

// Minimal Vite app proving the PS-B libs resolve and bundle end-to-end.
export default defineConfig({
  root: __dirname,
  build: { outDir: 'dist', emptyOutDir: true },
});
