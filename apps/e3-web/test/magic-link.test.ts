import { describe, it, expect, beforeEach } from 'vitest'
import { captureMagicLink, storedToken, magicLinkAuthProvider } from '../src/auth/magic-link'

const mem = (): Storage => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage }

describe('E3 magic-link', () => {
  let s: Storage
  beforeEach(() => { s = mem() })
  it('captures a token from ?token= and persists it', () => {
    const t = captureMagicLink(new URL('https://x/e3/?token=abc.def'), s)
    expect(t).toBe('abc.def')
    expect(storedToken(s)).toBe('abc.def')
  })
  it('returns the stored token when the URL has none', () => {
    s.setItem('pf.e3.magiclink', 'kept')
    expect(captureMagicLink(new URL('https://x/e3/'), s)).toBe('kept')
  })
  it('auth provider emits a Bearer header when a token is stored, null otherwise', async () => {
    expect(await magicLinkAuthProvider(s)()).toBeNull()
    s.setItem('pf.e3.magiclink', 'zzz')
    expect(await magicLinkAuthProvider(s)()).toEqual({ name: 'authorization', value: 'Bearer zzz' })
  })
})
