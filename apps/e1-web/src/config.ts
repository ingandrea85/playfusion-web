export interface AppConfig {
  apiBaseUrl: string
  orgId: string
  auth0?: { domain: string; clientId: string; audience: string }
}

export function readConfig(env: ImportMetaEnv): AppConfig {
  const apiBaseUrl = env.VITE_API_BASE_URL ?? ''
  const orgId = env.VITE_DEFAULT_ORG_ID ?? 'org-pilot'
  const auth0 = env.VITE_AUTH0_DOMAIN && env.VITE_AUTH0_CLIENT_ID && env.VITE_AUTH0_AUDIENCE
    ? { domain: env.VITE_AUTH0_DOMAIN, clientId: env.VITE_AUTH0_CLIENT_ID, audience: env.VITE_AUTH0_AUDIENCE }
    : undefined
  return { apiBaseUrl, orgId, auth0 }
}
