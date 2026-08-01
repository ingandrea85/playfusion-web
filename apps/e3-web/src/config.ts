export interface AppConfig {
  apiBaseUrl: string
}

export function readConfig(env: ImportMetaEnv): AppConfig {
  return { apiBaseUrl: env.VITE_API_BASE_URL ?? '' }
}
