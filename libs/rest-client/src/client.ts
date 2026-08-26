import type { HttpConfig } from './http.js'
import { o2, type O2Api } from './o2.js'
import { o3, type O3Api } from './o3.js'
import { o4, type O4Api } from './o4.js'
import { o5, type O5Api } from './o5.js'
import { o12, type O12Api } from './o12.js'
import { o7, type O7Api } from './o7.js'
import { o9, type O9Api } from './o9.js'
import { o1, type O1Api } from './o1.js'

export interface Client { o1: O1Api; o2: O2Api; o3: O3Api; o4: O4Api; o5: O5Api; o12: O12Api; o7: O7Api; o9: O9Api }

/** The single FE->backend seam (ADR-008). `cfg.baseUrl` is the API Gateway stage root;
 *  each BC method prefixes its own /o<n> route. */
export function createClient(cfg: HttpConfig): Client {
  return { o1: o1(cfg), o2: o2(cfg), o3: o3(cfg), o4: o4(cfg), o5: o5(cfg), o12: o12(cfg), o7: o7(cfg), o9: o9(cfg) }
}
