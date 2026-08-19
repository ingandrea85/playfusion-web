import { describe, it, expect } from 'vitest'
import type { EventDetail, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { renderPublicBracket } from '../src/views/bracket'
import { renderLanding } from '../src/views/landing'

const event: EventDetail = { sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published', playbook: 'PB-1', name: 'Torneo' }
const cfg: ScheduleView['config'] = { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' }
const sched = (status: ScheduleView['status']): ScheduleView => ({ sportEventId: 'e1', organizationId: 'org', status, config: cfg })
const fin = (over: Partial<ScheduledMatchView> = {}): ScheduledMatchView =>
  ({ id: 'fm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Tabellone', day: 'd', time: '10:00', field: 'C', home: '1ª Girone A', away: '2ª Girone A', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'Finale', order: 1, ...over })

describe('e3 public bracket (S12)', () => {
  it('gates on PUBLISHED', () => {
    expect(renderPublicBracket(event, sched('GENERATED'), [fin()])).toContain('non è ancora stato pubblicato')
  })
  it('renders the bracket with placeholders when published', () => {
    const html = renderPublicBracket(event, sched('PUBLISHED'), [fin()])
    expect(html).toContain('Tabellone')
    expect(html).toContain('1ª Girone A')
    expect(html).toContain('2ª Girone A')
  })
  it('shows resolved teams when known', () => {
    const html = renderPublicBracket(event, sched('PUBLISHED'), [fin({ homeResolved: 'Alfa', awayResolved: 'Bravo' })])
    expect(html).toContain('Alfa')
    expect(html).not.toContain('1ª Girone A')
  })
  it('shows a hint when the event has no finals', () => {
    expect(renderPublicBracket(event, sched('PUBLISHED'), [])).toContain('Nessuna fase finale')
  })
})

describe('e3 landing Tabellone link (S12)', () => {
  const win = { sportEventId: 'e1', state: 'Open' as const, categories: [] }
  it('links Tabellone when published, hides it otherwise', () => {
    expect(renderLanding(event, win, true)).toContain(`#/events/e1/bracket`)
    expect(renderLanding(event, win, false)).not.toContain(`#/events/e1/bracket`)
  })
})

describe('e3 public bracket shows the final ranking (S13)', () => {
  const finalM: ScheduledMatchView = { id: 'fm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Tabellone', day: 'd', time: 't', field: 'f', home: '1ª Girone A', away: '2ª Girone A', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'F' }
  it('renders Classifica finale with positions', () => {
    const html = renderPublicBracket(event, sched('PUBLISHED'), [finalM], [{ categoryId: 'U10', rows: [{ position: 1, team: 'Alfa' }, { position: 2, team: 'Bravo' }] }])
    expect(html).toContain('Classifica finale')
    expect(html).toContain('1º')
    expect(html).toContain('Alfa')
  })
})
