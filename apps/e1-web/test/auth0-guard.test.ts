// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { ensureAuthenticated, authProviderFrom, appBaseFromPath, orgIdFromClaims, type Auth0Port } from '../src/auth/auth0'

const port = (over: Partial<Auth0Port>): Auth0Port => ({
  isAuthenticated: vi.fn().mockResolvedValue(false),
  handleRedirectCallback: vi.fn().mockResolvedValue(undefined),
  loginWithRedirect: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  getToken: vi.fn().mockResolvedValue('access-token'),
  getOrgId: vi.fn().mockResolvedValue('org-9'),
  getUser: vi.fn().mockResolvedValue({ name: 'Test', email: 't@x.io', roles: ['organizer'] }),
  changePassword: vi.fn().mockResolvedValue(undefined),
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
  it('opens Auth0 on the sign-up screen when ?signup is present', async () => {
    const p = port({ isAuthenticated: vi.fn().mockResolvedValue(false) })
    await ensureAuthenticated(p, '?signup=1')
    expect(p.loginWithRedirect).toHaveBeenCalledWith({ signup: true })
  })
  it('opens a normal login when ?signup is absent', async () => {
    const p = port({ isAuthenticated: vi.fn().mockResolvedValue(false) })
    await ensureAuthenticated(p, '')
    expect(p.loginWithRedirect).toHaveBeenCalledWith({ signup: false })
  })
  it('starts an org-scoped login to accept an invitation link', async () => {
    // Even an already-authenticated session must switch into the invited org to accept.
    const p = port({ isAuthenticated: vi.fn().mockResolvedValue(true) })
    const ok = await ensureAuthenticated(p, '?invitation=INV&organization=org_1&organization_name=acme')
    expect(ok).toBe(false)
    expect(p.loginWithRedirect).toHaveBeenCalledWith({ invitation: 'INV', organization: 'org_1' })
    expect(p.isAuthenticated).not.toHaveBeenCalled()
  })
})

describe('orgIdFromClaims', () => {
  const AUD = 'https://plafusionapi.it'
  it('reads the namespaced org_id claim (post-login Action stamps it there)', () => {
    expect(orgIdFromClaims({ [`${AUD}/org_id`]: 'org_abc' }, AUD)).toBe('org_abc')
  })
  it('falls back to the native org_id claim (org-scoped login)', () => {
    expect(orgIdFromClaims({ org_id: 'org_native' }, AUD)).toBe('org_native')
  })
  it('is undefined when neither claim is present', () => {
    expect(orgIdFromClaims({ sub: 'u1' }, AUD)).toBeUndefined()
    expect(orgIdFromClaims(undefined, AUD)).toBeUndefined()
  })
})

describe('appBaseFromPath', () => {
  it('maps /app paths to the /app/ base and everything else to /e1/', () => {
    expect(appBaseFromPath('/app/')).toBe('/app/')
    expect(appBaseFromPath('/app')).toBe('/app/')
    expect(appBaseFromPath('/e1/')).toBe('/e1/')
    expect(appBaseFromPath('/')).toBe('/e1/')
  })
})
