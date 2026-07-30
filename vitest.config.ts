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
          // Also picks up workspace-level unit tests under test/ (e.g. the S0.4
          // lint-boundary proof); the excludes keep integration + e2e files out.
          include: ['{services,libs}/*/test/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: ['**/*.it.test.ts', '**/*.e2e.test.ts'],
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
      {
        resolve: { alias },
        test: {
          // Pilot acceptance E2E against a real deployed env (S0.14); skip-gated on
          // API_BASE_URL, so it is a no-op unless pointed at a deployed stage.
          name: 'e2e',
          include: ['test/e2e/**/*.e2e.test.ts'],
        },
      },
    ],
  },
})
