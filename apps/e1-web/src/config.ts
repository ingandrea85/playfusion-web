export interface AppConfig {
  apiBaseUrl: string
  orgId: string
  e3BaseUrl: string
  auth0?: { domain: string; clientId: string; audience: string; connection: string }
}

export function readConfig(env: ImportMetaEnv): AppConfig {
  const apiBaseUrl = env.VITE_API_BASE_URL ?? ''
  const orgId = env.VITE_DEFAULT_ORG_ID ?? 'org-pilot'
  const e3BaseUrl = env.VITE_E3_BASE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const auth0 = env.VITE_AUTH0_DOMAIN && env.VITE_AUTH0_CLIENT_ID && env.VITE_AUTH0_AUDIENCE
    ? {
        domain: env.VITE_AUTH0_DOMAIN, clientId: env.VITE_AUTH0_CLIENT_ID, audience: env.VITE_AUTH0_AUDIENCE,
        // Database connection whose password the "Cambia password" flow resets.
        connection: env.VITE_AUTH0_DB_CONNECTION ?? 'Username-Password-Authentication',
      }
    : undefined
  return { apiBaseUrl, orgId, e3BaseUrl, auth0 }
}
