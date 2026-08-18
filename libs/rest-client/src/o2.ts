import { request, type HttpConfig } from './http.js'
import { bearer } from './auth.js'
import type { MagicLinkInput, MagicLinkResult, VerifyResult } from './types.js'
export interface O2Api {
  mintMagicLink(input: MagicLinkInput): Promise<MagicLinkResult>
  verify(token: string): Promise<VerifyResult>
}
export const o2 = (cfg: HttpConfig): O2Api => ({
  mintMagicLink: (input) => request(cfg, 'POST', '/o2/identities/magic-link', input),
  // GET /o2/identities/verify reads the Authorization header; pass the token as a one-shot auth override.
  verify: (token) => request({ ...cfg, auth: () => bearer(token) }, 'GET', '/o2/identities/verify'),
})
