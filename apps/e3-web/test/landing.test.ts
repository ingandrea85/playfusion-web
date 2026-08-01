import { describe, it, expect } from 'vitest'
import { renderLanding, renderParticipants } from '../src/views/landing'

const ev = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10', 'U12'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published' as const }
const win = { sportEventId: 'e1', state: 'Open' as const, categories: [{ categoria: 'U10', cap: 8, count: 3, remaining: 5 }] }

describe('e3 views', () => {
  it('landing shows the public hero + a category capacity tag', () => {
    const html = renderLanding(ev, win)
    expect(html).toContain('pf-hero')
    expect(html).toContain('3/8')
  })
  it('participants lists confirmed teams', () => {
    const html = renderParticipants([{ registrationId: 'r', participantRef: 'Team A', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' }])
    expect(html).toContain('Team A')
  })
})
