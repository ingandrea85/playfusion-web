import { RestError } from './errors.js'
import type { AuthProvider } from './auth.js'

export interface HttpConfig {
  baseUrl: string            // API Gateway stage root, e.g. https://<id>.execute-api.<region>.amazonaws.com/prod
  auth?: AuthProvider
  orgId?: string
  correlationId?: () => string
  fetch?: typeof fetch       // injectable for tests; defaults to global fetch
}

const genId = () => (globalThis.crypto?.randomUUID?.() ?? `cid-${Date.now()}`)

export async function request<T>(cfg: HttpConfig, method: string, path: string, body?: unknown): Promise<T> {
  const doFetch = cfg.fetch ?? fetch
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.orgId) headers['x-organization-id'] = cfg.orgId
  headers['x-correlation-id'] = cfg.correlationId ? cfg.correlationId() : genId()
  const authHeader = cfg.auth ? await cfg.auth() : null
  if (authHeader) headers[authHeader.name] = authHeader.value

  const res = await doFetch(`${cfg.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await res.text()
  const parsed: unknown = text ? safeJson(text) : undefined
  if (!res.ok) {
    const code = codeOf(parsed) ?? res.statusText ?? 'Error'
    throw new RestError(res.status, code, `${method} ${path} -> ${res.status} ${code}`, parsed)
  }
  return parsed as T
}

const safeJson = (t: string): unknown => { try { return JSON.parse(t) } catch { return t } }
const codeOf = (b: unknown): string | undefined => {
  if (b && typeof b === 'object') {
    const o = b as Record<string, unknown>
    if (typeof o.error === 'string') return o.error
    if (typeof o.code === 'string') return o.code
  }
  return undefined
}
