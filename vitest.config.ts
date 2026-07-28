import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Resolve @playfusion/platform-lib to its TypeScript source so unit + integration
// tests run without a prior `tsc` build (Vitest transpiles on the fly). Production
// builds still resolve the package via its built dist/ (package.json main).
const alias = {
  '@playfusion/platform-lib': resolve(__dirname, 'libs/platform-lib/src/index.ts'),
}

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['{services,libs}/*/test/**/*.test.ts'],
          exclude: ['**/*.it.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['{services,libs}/*/test/**/*.it.test.ts', 'test/**/*.it.test.ts'],
          setupFiles: ['./test/setup/localstack-env.ts'],
        },
      },
    ],
  },
})
