// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { EventDetail, GroupStanding, ScheduledMatchView, ScheduleView } from '@playfusion/rest-client'
import { renderPublicCalendar, wirePublicCalendar } from '../src/views/calendar'
import { renderPublicStandings, wirePublicStandings } from '../src/views/standings'

const event: EventDetail = { sportEventId: 'e1', sport: 'Calcio', categorie: ['U10', 'U12'], dates: { from: 'a', to: 'b' }, status: 'Published', playbook: 'PB-1', name: 'Torneo' }
const cfg: ScheduleView['config'] = { fields: ['C'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' }
const m = (id: string, cat: string, grp: string, home: string, away: string): ScheduledMatchView =>
  ({ id, sportEventId: 'e1', categoryId: cat, groupLabel: grp, day: '2026-08-29', time: '09:00', field: 'C', home, away })
const matches = [m('s1', 'U10', 'Girone A', 'A', 'B'), m('s2', 'U10', 'Girone B', 'C', 'D'), m('s3', 'U12', 'Girone A', 'E', 'F')]

describe('e3 public calendar tabs (S23)', () => {
  const mount = () => {
    const root = document.createElement('div')
    root.innerHTML = renderPublicCalendar(event, { sportEventId: 'e1', organizationId: 'o', status: 'PUBLISHED', config: cfg }, matches)
    wirePublicCalendar(root, matches)
    return root
  }
  it('defaults to first category (all gironi); category/girone tabs filter', () => {
    const root = mount()
    expect(root.querySelector('#calbody')!.innerHTML).toContain('A <b>vs</b> B')
    expect(root.querySelector('#calbody')!.innerHTML).not.toContain('E <b>vs</b> F')
    ;(root.querySelector('#cal-cattabs [data-key="U12"]') as HTMLButtonElement).click()
    expect(root.querySelector('#calbody')!.innerHTML).toContain('E <b>vs</b> F')
    ;(root.querySelector('#cal-cattabs [data-key="U10"]') as HTMLButtonElement).click()
    ;(root.querySelector('#cal-girtabs [data-key="Girone B"]') as HTMLButtonElement).click()
    expect(root.querySelector('#calbody')!.innerHTML).toContain('C <b>vs</b> D')
    expect(root.querySelector('#calbody')!.innerHTML).not.toContain('A <b>vs</b> B')
  })
  it('no tabs when not published', () => {
    const root = document.createElement('div')
    root.innerHTML = renderPublicCalendar(event, { sportEventId: 'e1', organizationId: 'o', status: 'GENERATED', config: cfg }, matches)
    expect(root.querySelector('#calbody')).toBeNull()
    expect(root.innerHTML).toContain('non è ancora stato pubblicato')
  })
})

describe('e3 public standings tabs (S23)', () => {
  const st: GroupStanding[] = [
    { categoryId: 'U10', groupLabel: 'Girone A', rows: [{ team: 'A', played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }] },
    { categoryId: 'U12', groupLabel: 'Girone A', rows: [{ team: 'E', played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }] },
  ]
  it('category tabs filter the tables', () => {
    const root = document.createElement('div')
    root.innerHTML = renderPublicStandings(event, st)
    wirePublicStandings(root, st)
    expect(root.querySelector('#stbody')!.innerHTML).toContain('U10 · Girone A')
    expect(root.querySelector('#stbody')!.innerHTML).not.toContain('U12')
    ;(root.querySelector('#st-cattabs [data-key="U12"]') as HTMLButtonElement).click()
    expect(root.querySelector('#stbody')!.innerHTML).toContain('U12 · Girone A')
  })
})
