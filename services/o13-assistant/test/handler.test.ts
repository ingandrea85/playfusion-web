import { describe, it, expect, vi } from 'vitest'
import { signMagicLink } from '@playfusion/platform-lib'
import { makeApp } from '../src/handler.js'
import type { Deps } from '../src/application/draft.js'

const DRAFT_JSON = JSON.stringify({ draft: {
  event: { name: 'F', sportId: 'rugby', participantType: 'team', format: 'festival',
           categorie: ['U10'], dates: { from: '2026-09-13', to: '2026-09-13' }, playbook: 'PB-1' },
  schedule: { fields: ['C1'], periods: 1, periodMinutes: 15, breakMinutes: 3, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE', finalsEnabled: false },
  rationale: 'x', assumptions: [],
} })

const deps = (plan = 'CLUB', status = 'ACTIVE'): Deps => ({
  subs: { getPlanAndStatus: vi.fn().mockResolvedValue({ plan, status }) },
  usage: { count: vi.fn().mockResolvedValue(0), increment: vi.fn().mockResolvedValue(undefined) },
  ai: { complete: vi.fn().mockResolvedValue(DRAFT_JSON) },
  now: () => new Date('2026-09-13T00:00:00Z'),
})

// No live Auth0 config in the test env, so `requireOrganizer` only has its magic-link bridge
// path available (see libs/platform-lib/src/auth-middleware.ts). Mint a bridge token carrying
// the default manager role, exactly as services/o3-sport-events/test/integration/publish-event.it.test.ts
// and services/o7-scheduling/test/handler-checkoffs.test.ts do for their organizer/steward routes.
const organizerToken = signMagicLink({ subject: 'it-organizer', roles: ['RegistrationManager'] })
const authHeaders = { 'content-type': 'application/json', authorization: `Bearer ${organizerToken}` }

const call = (app: ReturnType<typeof makeApp>, body: unknown) =>
  app.request('/organizations/org-1/assistant:draft', {
    method: 'POST', headers: authHeaders, body: JSON.stringify(body),
  })

describe('o13 handler', () => {
  it('200 with a draft for an entitled org', async () => {
    const res = await call(makeApp(deps()), { description: 'festa' })
    expect(res.status).toBe(200)
    expect((await res.json()).draft.event.format).toBe('festival')
  })
  it('403 for an unentitled plan', async () => {
    const res = await call(makeApp(deps('FREE')), { description: 'x' })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('AI_NOT_ENTITLED')
  })
  it('422 when the model output is unusable', async () => {
    const d = deps(); (d.ai.complete as any) = vi.fn().mockResolvedValue('non ho capito')
    const res = await call(makeApp(d), { description: 'x' })
    expect(res.status).toBe(422)
  })
  it('400 on an empty body (missing description)', async () => {
    const res = await call(makeApp(deps()), {})
    expect(res.status).toBe(400)
  })

  describe('org enforcement is bound to the JWT identity, not the URL path', () => {
    // The magic-link bridge can carry an organizationId too (see libs/platform-lib/src/magic-link.ts
    // `claims.organizationId` / payload `org`); mint one for org-A to exercise the mismatch guard.
    const orgAToken = signMagicLink({ subject: 'it-organizer-a', roles: ['RegistrationManager'], organizationId: 'org-A' })
    const orgAHeaders = { 'content-type': 'application/json', authorization: `Bearer ${orgAToken}` }

    it('403 ORG_MISMATCH when the identity org differs from the path org', async () => {
      const res = await makeApp(deps()).request('/organizations/org-B/assistant:draft', {
        method: 'POST', headers: orgAHeaders, body: JSON.stringify({ description: 'festa' }),
      })
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe('ORG_MISMATCH')
    })

    it('200 when the identity org matches the path org', async () => {
      const res = await makeApp(deps()).request('/organizations/org-A/assistant:draft', {
        method: 'POST', headers: orgAHeaders, body: JSON.stringify({ description: 'festa' }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).draft.event.format).toBe('festival')
    })
  })
})
