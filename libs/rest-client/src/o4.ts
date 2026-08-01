import { request, type HttpConfig } from './http.js'
import type { CreateParticipantInput } from './types.js'
export interface O4Api { createParticipant(input: CreateParticipantInput): Promise<{ participantId: string }> }
export const o4 = (cfg: HttpConfig): O4Api => ({
  createParticipant: (input) => request(cfg, 'POST', '/o4/participants', input),
})
