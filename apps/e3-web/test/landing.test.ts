import { describe, it, expect } from 'vitest'
import { renderLanding, renderParticipants } from '../src/views/landing'

const ev = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10', 'U12'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published' as const, playbook: 'PB-1' as const }
const win = { sportEventId: 'e1', state: 'Open' as const, categories: [{ categoria: 'U10', cap: 8, count: 3, remaining: 5 }] }
const closedWin = { ...win, state: 'Closed' as const }

describe('e3 views', () => {
  it('landing shows the public hero + category chips linking to the calendar (no capacity)', () => {
    const html = renderLanding(ev, win, true) // published → chips link to the calendar
    expect(html).toContain('pf-hero')
    expect(html).not.toContain('3/8') // enrollment capacity is organizer info, not for spectators
    expect(html).toContain(`#/events/${ev.sportEventId}/calendar/${encodeURIComponent(ev.categorie[0])}`)
  })
  it('landing category chips are not links before the calendar is published', () => {
    expect(renderLanding(ev, win, false)).not.toContain('/calendar')
  })
  it('landing has NO apply CTA (registration is a separate page via the organizer link)', () => {
    expect(renderLanding(ev, win)).not.toContain(`#/events/${ev.sportEventId}/apply`)
    expect(renderLanding(ev, closedWin)).not.toContain(`#/events/${ev.sportEventId}/apply`)
  })
  it('landing shows an enroll hint while the window is Open, none when Closed', () => {
    expect(renderLanding(ev, win)).toContain('link ricevuto dall\'organizzatore')
    expect(renderLanding(ev, closedWin)).not.toContain('link ricevuto')
  })
  it('participants lists confirmed teams', () => {
    const html = renderParticipants([{ registrationId: 'r', participantRef: 'Team A', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' }])
    expect(html).toContain('Team A')
  })
  it('participants shows confirmed participants only', () => {
    const html = renderParticipants([
      { registrationId: 'r1', participantRef: 'Team A', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' },
      { registrationId: 'r2', participantRef: 'Team B', sportEventId: 'e1', categoria: 'U10', status: 'Applied' },
    ])
    expect(html).toContain('Team A')
    expect(html).not.toContain('Team B')
  })
  it('participants filters by category tab (default first category)', () => {
    const html = renderParticipants([
      { registrationId: 'r1', participantRef: 'Alfa', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' },
      { registrationId: 'r2', participantRef: 'Bravo', sportEventId: 'e1', categoria: 'U12', status: 'Confirmed' },
    ])
    expect(html).toContain('pf-tabs')       // category tabs present
    expect(html).toContain('U10')
    expect(html).toContain('U12')
    expect(html).toContain('Alfa')          // first category (U10) shown by default
    expect(html).not.toContain('Bravo')     // U12 hidden until its tab is selected
  })
})
