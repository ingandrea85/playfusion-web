// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { EventDetail, GroupStanding } from '@playfusion/rest-client'
import { renderStandingsView, standingsScreen } from '../src/views/standings'

const event: EventDetail = { sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published', playbook: 'PB-1', name: 'Torneo' }
const standings: GroupStanding[] = [{ categoryId: 'U10', groupLabel: 'Girone A', rows: [
  { team: 'A', played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 0, goalDiff: 2, points: 3 },
  { team: 'B', played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 2, goalDiff: -2, points: 0 },
] }]

describe('e1 standings view', () => {
  it('renders the Classifiche tab + a table with teams ordered and points', () => {
    const html = renderStandingsView({ event, standings })
    expect(html).toContain('/standings') // tab href
    expect(html).toContain('U10 · Girone A')
    expect(html).toContain('A')
    expect(html).toContain('<b>3</b>') // points
  })
  it('shows an empty hint when there are no standings', () => {
    expect(renderStandingsView({ event, standings: [] })).toContain('Nessuna classifica')
  })
})

describe('e1 standings category/girone tabs (S23)', () => {
  const st: GroupStanding[] = [
    { categoryId: 'U10', groupLabel: 'Girone A', rows: [{ team: 'A', played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }] },
    { categoryId: 'U10', groupLabel: 'Girone B', rows: [{ team: 'B', played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }] },
    { categoryId: 'U12', groupLabel: 'Girone A', rows: [{ team: 'C', played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }] },
  ]
  const mount = () => {
    const ctx = { client: {} as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh: vi.fn() }
    const d = { event, standings: st }
    const root = document.createElement('div'); root.innerHTML = renderStandingsView(d)
    standingsScreen.mount!(root, ctx as any, d)
    return root
  }
  it('defaults to the first category (all gironi)', () => {
    const body = mount().querySelector('#stbody')!.innerHTML
    expect(body).toContain('U10 · Girone A')
    expect(body).toContain('U10 · Girone B')
    expect(body).not.toContain('U12')
  })
  it('category + girone tabs filter the tables', () => {
    const root = mount()
    ;(root.querySelector('#st-cattabs [data-key="U12"]') as HTMLButtonElement).click()
    expect(root.querySelector('#stbody')!.innerHTML).toContain('U12 · Girone A')
    ;(root.querySelector('#st-cattabs [data-key="U10"]') as HTMLButtonElement).click()
    ;(root.querySelector('#st-girtabs [data-key="Girone B"]') as HTMLButtonElement).click()
    const body = root.querySelector('#stbody')!.innerHTML
    expect(body).toContain('U10 · Girone B')
    expect(body).not.toContain('U10 · Girone A')
  })
})
