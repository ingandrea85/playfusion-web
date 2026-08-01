import { request, type HttpConfig } from './http.js'
export interface O12Api { payFee(registrationId: string): Promise<unknown> }
export const o12 = (cfg: HttpConfig): O12Api => ({
  payFee: (registrationId) => request(cfg, 'POST', `/o12/payments/${encodeURIComponent(registrationId)}/pay`),
})
