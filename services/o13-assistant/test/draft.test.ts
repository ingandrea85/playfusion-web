import { describe, it, expect, vi } from 'vitest'
import { generateDraft, AiForbidden, AiCapReached } from '../src/application/draft.js'
import type { SubscriptionReader, UsageStore, BedrockGateway } from '../src/ports.js'

const DRAFT_JSON = JSON.stringify({ draft: {
  event: { name: 'F', sportId: 'rugby', participantType: 'team', format: 'festival',
           categorie: ['U10'], dates: { from: '2026-09-13', to: '2026-09-13' }, playbook: 'PB-1' },
  schedule: { fields: ['C1'], periods: 1, periodMinutes: 15, breakMinutes: 3, dailyStart: '09:00',
              groupsCount: 1, legs: 'SINGLE', finalsEnabled: false },
  rationale: 'x', assumptions: [],
} })

const deps = (over: Partial<{ plan: string; status: string; used: number; raw: string }> = {}) => {
  const inc = vi.fn().mockResolvedValue(undefined)
  const subs: SubscriptionReader = { getPlanAndStatus: vi.fn().mockResolvedValue({ plan: over.plan ?? 'CLUB', status: over.status ?? 'ACTIVE' }) }
  const usage: UsageStore = { count: vi.fn().mockResolvedValue(over.used ?? 0), increment: inc }
  const ai: BedrockGateway = { complete: vi.fn().mockResolvedValue(over.raw ?? DRAFT_JSON) }
  return { subs, usage, ai, now: () => new Date('2026-09-13T00:00:00Z'), inc }
}

describe('generateDraft', () => {
  it('returns a draft and counts the successful generation', async () => {
    const d = deps()
    const out = await generateDraft(d)('org-1', { description: 'festa' })
    expect(out.draft?.event.format).toBe('festival')
    expect(d.inc).toHaveBeenCalledWith('org-1', '2026-09')
  })
  it('rejects an unentitled plan with AiForbidden and never calls Bedrock', async () => {
    const d = deps({ plan: 'FREE' })
    await expect(generateDraft(d)('org-1', { description: 'x' })).rejects.toBeInstanceOf(AiForbidden)
    expect(d.ai.complete).not.toHaveBeenCalled()
  })
  it('rejects when the monthly cap is reached (CLUB active = 20)', async () => {
    const d = deps({ used: 20 })
    await expect(generateDraft(d)('org-1', { description: 'x' })).rejects.toBeInstanceOf(AiCapReached)
    expect(d.ai.complete).not.toHaveBeenCalled()
  })
  it('a trial is capped at 5', async () => {
    const under = deps({ status: 'TRIAL', used: 4 })
    await expect(generateDraft(under)('o', { description: 'x' })).resolves.toBeDefined()
    const over = deps({ status: 'TRIAL', used: 5 })
    await expect(generateDraft(over)('o', { description: 'x' })).rejects.toBeInstanceOf(AiCapReached)
  })
  it('does NOT count a generation when the model returns completion questions', async () => {
    const d = deps({ raw: JSON.stringify({ openQuestions: [{ field: 'fields', question: 'Quanti campi?' }] }) })
    const out = await generateDraft(d)('o', { description: 'x' })
    expect(out.openQuestions).toHaveLength(1)
    expect(d.inc).not.toHaveBeenCalled()
  })
})
