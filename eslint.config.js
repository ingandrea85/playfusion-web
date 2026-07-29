import nxPlugin from '@nx/eslint-plugin'
import tseslint from 'typescript-eslint'

// ADR-011 "no-cross-BC" boundary, expressed natively via Nx.
// Each package is tagged (scope:app|lib|service|infra) in its package.json `nx.tags`;
// the rule below forbids disallowed cross-imports across those layers.
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '.nx/**', 'mockups/**', '**/storybook-static/**']
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@nx': nxPlugin },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [],
          depConstraints: [
            { sourceTag: 'scope:app', onlyDependOnLibsWithTags: ['scope:lib'] },
            { sourceTag: 'scope:service', onlyDependOnLibsWithTags: ['scope:lib'] },
            { sourceTag: 'scope:lib', onlyDependOnLibsWithTags: ['scope:lib'] },
            { sourceTag: 'scope:infra', onlyDependOnLibsWithTags: ['*'] }
          ]
        }
      ]
    }
  },
  {
    // Belt-and-suspenders cross-BC guard (ADR-002), ported from the pilot: even a
    // relative import that reaches into another BC's tree is forbidden. Services
    // communicate only via REST command or Domain Event.
    files: ['services/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/o[0-9]*-*/**'],
          message: 'Cross-BC import forbidden (ADR-002). Communicate via REST command or Domain Event only.'
        }]
      }]
    }
  },
  {
    files: ['services/**/src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "ImportExpression > Literal[value=/\\/o[0-9]+-/]",
        message: 'Cross-BC dynamic import() forbidden in production src (ADR-002). Communicate via REST command or Domain Event only.'
      }]
    }
  },
  {
    // Integration tests black-box-wire several BCs together (spinning up their HTTP
    // handlers/consumers), which the pilot allowed by scoping its cross-BC rules to
    // src/** only. Exempt test code from the boundary rules; production src stays policed.
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off'
    }
  }
]
