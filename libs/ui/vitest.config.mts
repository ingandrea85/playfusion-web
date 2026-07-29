import { defineConfig } from 'vitest/config';

// Component specs run in jsdom with CSS side-effect imports enabled. Isolated from the
// backend root vitest projects (which glob *.test.ts under test/); these are *.spec.ts
// under src/, so `npm test` at the root never picks them up.
export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/ui',
  test: {
    name: '@playfusion/ui',
    watch: false,
    globals: true,
    environment: 'jsdom',
    css: true,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
}));
