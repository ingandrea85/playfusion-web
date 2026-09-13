import { request, type HttpConfig } from './http.js'
import type { DraftInput, DraftResponse } from './types.js'

export interface O13Api {
  draftEvent(organizationId: string, input: DraftInput): Promise<DraftResponse>
}
const enc = encodeURIComponent
export const o13 = (cfg: HttpConfig): O13Api => ({
  draftEvent: (orgId, input) => request(cfg, 'POST', `/o13/organizations/${enc(orgId)}/assistant:draft`, input),
})
