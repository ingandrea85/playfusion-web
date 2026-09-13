import { aiAssistantCap } from '@playfusion/entitlements'
import type { DraftInput, DraftResponse } from '../domain.js'
import type { SubscriptionReader, UsageStore, BedrockGateway } from '../ports.js'
import { buildPrompt } from '../prompt.js'
import { parseAndValidateDraft, monthKey } from '../validate.js'

export class AiForbidden extends Error {}
export class AiCapReached extends Error {}

export type Deps = { subs: SubscriptionReader; usage: UsageStore; ai: BedrockGateway; now?: () => Date }

export function generateDraft(d: Deps) {
  return async (organizationId: string, input: DraftInput): Promise<DraftResponse> => {
    const { plan, status } = await d.subs.getPlanAndStatus(organizationId)
    const cap = aiAssistantCap(plan, status)
    if (cap === 0) throw new AiForbidden('AI assistant non incluso nel piano')

    const month = monthKey(d.now ? d.now() : new Date())
    const used = await d.usage.count(organizationId, month)
    if (cap !== null && used >= cap) throw new AiCapReached('tetto mensile raggiunto')

    console.error('[o13-diag] entitlement', JSON.stringify({ plan, status, cap, used }))
    const raw = await d.ai.complete(buildPrompt(input))
    let resp: DraftResponse
    try {
      resp = parseAndValidateDraft(raw)     // throws AiInvalidDraft on malformed/illegal
    } catch (e) {
      // [o13-diag] the model output that failed validation — see WHY it 422'd.
      console.error('[o13-diag] validate-fail', JSON.stringify({ message: (e as Error).message, rawLen: raw.length, rawHead: raw.slice(0, 500) }))
      throw e
    }
    if (resp.draft) await d.usage.increment(organizationId, month)   // count only successful generations
    return resp
  }
}
