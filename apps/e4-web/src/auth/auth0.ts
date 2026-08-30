import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js'
import type { AuthProvider } from '@playfusion/rest-client'
import type { AppConfig } from '../config.js'

export interface Auth0User { name?: string; email?: string; roles: string[] }

export interface Auth0Port {
  isAuthenticated(): Promise<boolean>
  handleRedirectCallback(): Promise<void>
  loginWithRedirect(): Promise<void>
  logout(): Promise<void>
  getToken(): Promise<string>
  getUser(): Promise<Auth0User | undefined>
}

/** Wraps @auth0/auth0-spa-js behind Auth0Port so the guard is unit-testable with a fake. */
export function createAuth0Adapter(cfg: NonNullable<AppConfig['auth0']>): Auth0Port {
  let clientP: Promise<Auth0Client> | null = null
  const redirectUri = `${window.location.origin}/e4/`
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
      finally { window.history.replaceState({}, '', '/e4/') }
    },
    loginWithRedirect: async () => (await client()).loginWithRedirect(),
    logout: async () => (await client()).logout({ logoutParams: { returnTo: redirectUri } }),
    getToken: async () => (await client()).getTokenSilently(),
    getUser: async () => {
      const u = (await (await client()).getUser()) as Record<string, unknown> | undefined
      if (!u) return undefined
      const rolesRaw = u[`${cfg.audience}/roles`]
      const roles = Array.isArray(rolesRaw) ? rolesRaw.map(String) : []
      return { name: u.name as string | undefined, email: u.email as string | undefined, roles }
    },
  }
}

/** Guard: consume the redirect callback, then gate on authentication (kicks off login when absent). */
export async function ensureAuthenticated(port: Auth0Port, search = window.location.search): Promise<boolean> {
  const params = new URLSearchParams(search)
  if (params.has('code') && params.has('state')) {
    try { await port.handleRedirectCallback() } catch { /* fall through */ }
  }
  if (await port.isAuthenticated()) return true
  await port.loginWithRedirect()
  return false
}

export const authProviderFrom = (port: Auth0Port): AuthProvider => async () => ({ name: 'authorization', value: `Bearer ${await port.getToken()}` })
