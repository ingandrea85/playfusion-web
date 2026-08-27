// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { errorCard, inlineError, runScreen, type Screen, type ViewCtx } from '../src/view'
import { entitlements } from '@playfusion/entitlements'

const ctx = { client: {} as any, orgId: 'o', e3BaseUrl: 'https://x', navigate: () => {}, refresh: () => {}, isPlatformAdmin: false, entitlements: entitlements('PRO') } satisfies ViewCtx

describe('view infra', () => {
  it('runScreen loads, renders, then mounts', async () => {
    const calls: string[] = []
    const screen: Screen<{ n: number }> = {
      load: async () => { calls.push('load'); return { n: 1 } },
      render: (d) => { calls.push('render'); return `<i>${d.n}</i>` },
      mount: () => { calls.push('mount') },
    }
    const root = document.createElement('div')
    await runScreen(root, ctx, {}, screen)
    expect(calls).toEqual(['load', 'render', 'mount'])
    expect(root.innerHTML).toContain('<i>1</i>')
  })
  it('runScreen renders the error card when load rejects', async () => {
    const root = document.createElement('div')
    await runScreen(root, ctx, {}, { load: async () => { throw new Error('x') }, render: () => '' })
    expect(root.innerHTML).toContain('Si è verificato un errore')
  })
  it('errorCard/inlineError produce cards', () => {
    expect(errorCard('m')).toContain('pf-card'); expect(inlineError('m')).toContain('role="alert"')
  })
})
