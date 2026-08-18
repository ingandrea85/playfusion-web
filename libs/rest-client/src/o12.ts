import { request, type HttpConfig } from './http.js'
import type { FeeView } from './types.js'
export interface O12Api {
  payFee(registrationId: string): Promise<unknown>
  listFees(eventId: string): Promise<FeeView[]>
}
export const o12 = (cfg: HttpConfig): O12Api => ({
  payFee: (registrationId) => request(cfg, 'POST', `/o12/payments/${encodeURIComponent(registrationId)}/pay`),
  listFees: (eventId) => request(cfg, 'GET', `/o12/events/${encodeURIComponent(eventId)}/fees`),
})
