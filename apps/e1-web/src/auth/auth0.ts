import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js'
import type { AuthProvider } from '@playfusion/rest-client'
import type { AppConfig } from '../config.js'

export interface Auth0Port {
  isAuthenticated(): Promise<boolean>
  handleRedirectCallback(): Promise<void>
  loginWithRedirect(): Promise<void>
  logout(): Promise<void>
  getToken(): Promise<string>
  getOrgId(): Promise<string | undefined>
}

const ORG_CLAIM = 'org_id'

/** Wraps @auth0/auth0-spa-js behind Auth0Port so the guard is unit-testable with a fake. */
export function createAuth0Adapter(cfg: NonNullable<AppConfig['auth0']>): Auth0Port {
  let clientP: Promise<Auth0Client> | null = null
  const redirectUri = `${window.location.origin}/e1/`
  const client = () => (clientP ??= createAuth0Client({
    domain: cfg.domain,
    clientId: cfg.clientId,
    authorizationParams: { redirect_uri: redirectUri, audience: cfg.audience, scope: 'openid profile email' },
    cacheLocation: 'localstorage',
  }))
  return {
    isAuthenticated: async () => (await client()).isAuthenticated(),
    handleRedirectCallback: async () => {
      try { await (await client()).handleRedirectCallback() }
      finally { window.history.replaceState({}, '', '/e1/') }
    },
    loginWithRedirect: async () => (await client()).loginWithRedirect(),
    logout: async () => (await client()).logout({ logoutParams: { returnTo: redirectUri } }),
    getToken: async () => (await client()).getTokenSilently(),
    getOrgId: async () => { const u = await (await client()).getUser(); return (u as Record<string, unknown> | undefined)?.[ORG_CLAIM] as string | undefined },
  }
}

/** Guard state machine. Consumes the redirect callback when returning from Auth0, then
 *  gates on authentication, kicking off login when absent. Returns whether to render. */
export async function ensureAuthenticated(port: Auth0Port, search = window.location.search): Promise<boolean> {
  const params = new URLSearchParams(search)
  if (params.has('code') && params.has('state')) {
    // A stale/expired/invalid callback must not permanently blank the page on reload —
    // fall through to the isAuthenticated() check, which restarts login when needed.
    try { await port.handleRedirectCallback() } catch { /* fall through */ }
  }
  if (await port.isAuthenticated()) return true
  await port.loginWithRedirect()
  return false
}

export const authProviderFrom = (port: Auth0Port): AuthProvider => async () => ({ name: 'authorization', value: `Bearer ${await port.getToken()}` })
