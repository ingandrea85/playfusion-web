import { describe, it, expect } from 'vitest'
import { renderEnroll } from '../src/views/enroll'

const base = {
  event: { sportEventId: 'e1', sport: 'calcio', categorie: ['U10', 'U12'], dates: { from: 'a', to: 'b' }, status: 'Published' as const, playbook: 'PB-1' as const },
  e3BaseUrl: 'https://host',
}

describe('enroll render', () => {
  it('shows a per-category cap input for each category', () => {
    const html = renderEnroll({ ...base, window: { sportEventId: 'e1', state: 'Closed', categories: [] }, pending: [] })
    expect(html).toContain('data-cap="U10"')
    expect(html).toContain('data-cap="U12"')
  })
  it('shows the share link and inbox rows with confirm/reject when the window is open', () => {
    const html = renderEnroll({
      ...base,
      window: { sportEventId: 'e1', state: 'Open', categories: [{ categoria: 'U10', cap: 8, count: 1, remaining: 7 }] },
      pending: [{ registrationId: 'r1', participantRef: 'Team A', sportEventId: 'e1', categoria: 'U10', status: 'Applied' }],
    })
    expect(html).toContain('https://host/e3/#/events/e1/apply')
    expect(html).toContain('Team A')
    expect(html).toContain('data-confirm="r1"')
    expect(html).toContain('data-reject="r1"')
  })
  it('shows an empty inbox message when no pending registrations', () => {
    expect(renderEnroll({ ...base, window: { sportEventId: 'e1', state: 'Open', categories: [] }, pending: [] }))
      .toMatch(/Nessuna richiesta/i)
  })
})

describe('enroll link (enrollment token)', () => {
  it('embeds the enroll token as ?token= before the hash when present', () => {
    const html = renderEnroll({
      ...base, enrollToken: 'tok-123',
      window: { sportEventId: 'e1', state: 'Open', categories: [] }, pending: [],
    })
    expect(html).toContain('https://host/e3/?token=tok-123#/events/e1/apply')
    expect(html).toContain('Invia questo link agli allenatori')
  })
  it('falls back to the plain landing link when no token yet', () => {
    const html = renderEnroll({ ...base, window: { sportEventId: 'e1', state: 'Open', categories: [] }, pending: [] })
    expect(html).toContain('https://host/e3/#/events/e1/apply')
    expect(html).not.toContain('?token=')
  })
})
