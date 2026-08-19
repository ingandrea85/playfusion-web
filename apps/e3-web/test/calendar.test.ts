import { describe, it, expect } from 'vitest'
import type { EventDetail, RegistrationWindowView, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { renderPublicCalendar } from '../src/views/calendar'
import { renderLanding } from '../src/views/landing'

const event: EventDetail = {
  sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'],
  dates: { from: '2026-08-29', to: '2026-08-30' }, status: 'Published', playbook: 'PB-1', name: 'Torneo Estivo',
}
const cfg: ScheduleView['config'] = { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' }
const sched = (status: ScheduleView['status']): ScheduleView => ({ sportEventId: 'e1', organizationId: 'org', status, config: cfg })
const match: ScheduledMatchView = { id: 'sm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-08-29', time: '09:00', field: 'Campo A', home: 'A', away: 'B' }
const win: RegistrationWindowView = { sportEventId: 'e1', state: 'Open', categories: [] }

describe('public calendar', () => {
  it('lists the matches when PUBLISHED', () => {
    const html = renderPublicCalendar(event, sched('PUBLISHED'), [match])
    expect(html).toContain('Girone A')
    expect(html).toContain('<b>vs</b>')
    expect(html).toContain('Torneo Estivo')
  })

  it('shows a not-published notice for any non-PUBLISHED status', () => {
    for (const s of ['NONE', 'GENERATED', 'APPROVED'] as const) {
      const html = renderPublicCalendar(event, sched(s), [match])
      expect(html).toContain('non è ancora stato pubblicato')
      expect(html).not.toContain('Girone A')
    }
  })
})

describe('landing calendar link', () => {
  it('shows a Calendario link only when the schedule is published', () => {
    expect(renderLanding(event, win, true)).toContain('/events/e1/calendar')
    expect(renderLanding(event, win, false)).not.toContain('/calendar')
    expect(renderLanding(event, win)).not.toContain('/calendar') // default = not published
  })
})
