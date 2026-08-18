// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { ensureAuthenticated, authProviderFrom, type Auth0Port } from '../src/auth/auth0'

const port = (over: Partial<Auth0Port>): Auth0Port => ({
  isAuthenticated: vi.fn().mockResolvedValue(false),
  handleRedirectCallback: vi.fn().mockResolvedValue(undefined),
  loginWithRedirect: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  getToken: vi.fn().mockResolvedValue('access-token'),
  getOrgId: vi.fn().mockResolvedValue('org-9'),
  ...over,
})

describe('E1 auth guard', () => {
  it('redirects to login when unauthenticated and returns false', async () => {
    const p = port({ isAuthenticated: vi.fn().mockResolvedValue(false) })
    const ok = await ensureAuthenticated(p)
    expect(p.loginWithRedirect).toHaveBeenCalled()
    expect(ok).toBe(false)
  })
  it('returns true and does not redirect when already authenticated', async () => {
    const p = port({ isAuthenticated: vi.fn().mockResolvedValue(true) })
    const ok = await ensureAuthenticated(p)
    expect(p.loginWithRedirect).not.toHaveBeenCalled()
    expect(ok).toBe(true)
  })
  it('handles the redirect callback when ?code&state are present', async () => {
    const search = '?code=abc&state=xyz'
    const p = port({ isAuthenticated: vi.fn().mockResolvedValue(true) })
    await ensureAuthenticated(p, search)
    expect(p.handleRedirectCallback).toHaveBeenCalled()
  })
  it('authProvider yields a Bearer header from the port token', async () => {
    const p = port({})
    const header = await authProviderFrom(p)()
    expect(header).toEqual({ name: 'authorization', value: 'Bearer access-token' })
  })
})
