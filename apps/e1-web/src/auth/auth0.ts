import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js'
import type { AuthProvider } from '@playfusion/rest-client'
import type { AppConfig } from '../config.js'

export interface Auth0User { name?: string; email?: string; picture?: string; roles: string[] }

/** Which path prefix the app is loaded under. `/app` is a CloudFront alias of the E1 bundle
 *  (which is built with base `/e1/`), so the Auth0 redirect must return to whichever the user
 *  actually opened. Both `/app/` and `/e1/` must be Allowed Callback/Web Origins in Auth0. */
export function appBaseFromPath(pathname: string): string {
  return pathname.startsWith('/app') ? '/app/' : '/e1/'
}

export interface Auth0Port {
  isAuthenticated(): Promise<boolean>
  handleRedirectCallback(): Promise<void>
  loginWithRedirect(opts?: { signup?: boolean }): Promise<void>
  logout(): Promise<void>
  getToken(): Promise<string>
  getOrgId(): Promise<string | undefined>
  /** The current user's profile + roles (from the namespaced ID-token claim). */
  getUser(): Promise<Auth0User | undefined>
  /** Trigger an Auth0 password-reset email for the current user (self-service account management). */
  changePassword(): Promise<void>
}

const ORG_CLAIM = 'org_id'

/** Wraps @auth0/auth0-spa-js behind Auth0Port so the guard is unit-testable with a fake. */
export function createAuth0Adapter(cfg: NonNullable<AppConfig['auth0']>): Auth0Port {
  let clientP: Promise<Auth0Client> | null = null
  const appBase = appBaseFromPath(window.location.pathname)
  const redirectUri = `${window.location.origin}${appBase}`
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
      finally { window.history.replaceState({}, '', appBase) }
    },
    loginWithRedirect: async (opts) => (await client()).loginWithRedirect(
      opts?.signup ? { authorizationParams: { screen_hint: 'signup' } } : undefined),
    logout: async () => (await client()).logout({ logoutParams: { returnTo: redirectUri } }),
    getToken: async () => (await client()).getTokenSilently(),
    getOrgId: async () => { const u = await (await client()).getUser(); return (u as Record<string, unknown> | undefined)?.[ORG_CLAIM] as string | undefined },
    getUser: async () => {
      const u = (await (await client()).getUser()) as Record<string, unknown> | undefined
      if (!u) return undefined
      // Auth0 custom claims are namespaced by the API audience (set by a tenant Action/Rule).
      const rolesRaw = u[`${cfg.audience}/roles`]
      const roles = Array.isArray(rolesRaw) ? rolesRaw.map(String) : []
      return { name: u.name as string | undefined, email: u.email as string | undefined, picture: u.picture as string | undefined, roles }
    },
    changePassword: async () => {
      const u = (await (await client()).getUser()) as Record<string, unknown> | undefined
      const email = u?.email as string | undefined
      if (!email) throw new Error('missing email — cannot reset password')
      // Auth0 Authentication API: emails the user a password-reset link (no auth required).
      const res = await fetch(`https://${cfg.domain}/dbconnections/change_password`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: cfg.clientId, email, connection: cfg.connection }),
      })
      if (!res.ok) throw new Error(`change_password failed: ${res.status}`)
    },
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
  // The marketing site sends new users here with ?signup=1 → open Auth0 on the sign-up screen.
  await port.loginWithRedirect({ signup: params.has('signup') })
  return false
}

export const authProviderFrom = (port: Auth0Port): AuthProvider => async () => ({ name: 'authorization', value: `Bearer ${await port.getToken()}` })
