import nxPlugin from '@nx/eslint-plugin'
import tseslint from 'typescript-eslint'

// ADR-011 "no-cross-BC" boundary, expressed natively via Nx.
// Each package is tagged (scope:app|lib|service|infra) in its package.json `nx.tags`;
// the rule below forbids disallowed cross-imports across those layers.
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '.nx/**', 'mockups/**']
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
  }
]
