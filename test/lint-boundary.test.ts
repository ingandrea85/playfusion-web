import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'

// S0.4 acceptance proof (issue #4): the ADR-002 no-cross-BC ESLint rules must bite.
// We lint source *snippets* through the real eslint.config.js via the ESLint Node API,
// giving each snippet a filePath under services/**/src so the service-scoped overrides
// apply — without ever leaving a lint-failing file in the tree (npm run lint stays green).
const eslint = new ESLint({ cwd: process.cwd() })

// A path inside one BC's production src, so both the Nx boundary rule and the
// services/** belt-and-suspenders rules are in scope for the snippet.
const SERVICE_SRC = 'services/o3-sport-events/src/__lint_probe__.ts'

async function lint(source: string) {
  const [result] = await eslint.lintText(source, { filePath: SERVICE_SRC })
  return result
}

describe('ADR-002 no-cross-BC boundary (ESLint)', () => {
  it('rejects a static import reaching into another Bounded Context', async () => {
    const result = await lint(
      `import { app } from '../../o5-registration/src/handler.js'\nvoid app\n`,
    )
    expect(result.errorCount).toBeGreaterThan(0)
    const restricted = result.messages.find((m) => m.ruleId === 'no-restricted-imports')
    expect(restricted, 'no-restricted-imports must fire on the cross-BC import').toBeDefined()
    expect(restricted!.message).toContain('Cross-BC import forbidden')
  })

  it('rejects a dynamic import() reaching into another Bounded Context', async () => {
    const result = await lint(
      `export async function load() { return import('../../o5-registration/src/handler.js') }\n`,
    )
    const restricted = result.messages.find((m) => m.ruleId === 'no-restricted-syntax')
    expect(restricted, 'no-restricted-syntax must fire on the dynamic cross-BC import()').toBeDefined()
    expect(restricted!.message).toContain('Cross-BC dynamic import()')
  })

  it('allows importing the shared platform-lib (rule is targeted, not a blanket ban)', async () => {
    const result = await lint(
      `import { busName } from '@playfusion/platform-lib'\nvoid busName\n`,
    )
    expect(result.errorCount).toBe(0)
  })
})
