import { beforeEach, describe, expect, it } from 'vitest'
import { renderOrganizerWorkspace, renderCalendar } from './chrome'
import { resetDemo, getEvent, listMembers, actAs, logout } from './mock/store'
import type { ScheduledMatch } from './mock/types'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('renderOrganizerWorkspace — role-gated tabs', () => {
  it('owner (default session) sees every tab', () => {
    logout()
    const html = renderOrganizerWorkspace(getEvent('evt-1')!, 'overview')
    expect(html).toContain('Impostazioni')
    expect(html).toContain('Iscrizioni')
    expect(html).toContain('Panoramica')
  })
  it('director sees only calendar/standings/bracket + a results-only chip', () => {
    const dir = listMembers('org-1').find(m => m.role === 'DIRECTOR')!
    actAs(dir.id)
    const html = renderOrganizerWorkspace(getEvent('evt-1')!, 'calendar')
    expect(html).toContain('Calendario')
    expect(html).toContain('Classifiche')
    expect(html).toContain('Tabellone')
    expect(html).not.toContain('Iscrizioni')
    expect(html).not.toContain('⚙ Impostazioni')
    expect(html).toContain('Director · solo risultati')
  })
  it('renders the "Agisci come" demo lever with the org members', () => {
    const html = renderOrganizerWorkspace(getEvent('evt-1')!, 'overview')
    expect(html).toContain('Agisci come')
    expect(html).toContain('__pfActAs(this.value)')
    expect(html).toContain('Director · Luca R.')
  })
})

describe('renderCalendar — results-only mode', () => {
  const m: ScheduledMatch = {
    id: 'm1', eventId: 'evt-1', categoryId: 'cat-1', groupLabel: 'Girone A',
    day: '2026-09-01', time: '10:00', field: 'Campo A', home: 'A', away: 'B', homeScore: null, awayScore: null,
  }
  it('true shows both reschedule and result buttons', () => {
    const html = renderCalendar([m], () => 'U10', true)
    expect(html).toContain('js-editmatch')
    expect(html).toContain('js-resultmatch')
  })
  it("'results' shows only the result button (director)", () => {
    const html = renderCalendar([m], () => 'U10', 'results')
    expect(html).not.toContain('js-editmatch')
    expect(html).toContain('js-resultmatch')
  })
})
