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
  it('uses the "Giocatore" column header for an individual event (S5)', () => {
    const indiv: EventDetail = { ...event, participantType: 'individual', sportProfile: { sportId: 't', name: 'Tennis', scoreLabel: 'Set', points: { win: 2, draw: null, loss: 0 }, tieBreak: [] } }
    const html = renderStandingsView({ event: indiv, standings })
    expect(html).toContain('<th>Giocatore</th>')
    expect(html).not.toContain('<th>Squadra</th>')
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

describe('e1 tie-break resolution (S11)', () => {
  const rows = (teams: string[]) => teams.map((t) => ({ team: t, played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, goalDiff: 0, points: 1 }))
  const tied: GroupStanding[] = [{ categoryId: 'U10', groupLabel: 'Girone A', rows: rows(['Alfa', 'Bravo']), unresolved: [['Alfa', 'Bravo']] }]

  const mountWith = (st: GroupStanding[], setTieOverride = vi.fn().mockResolvedValue({})) => {
    const refresh = vi.fn()
    const ctx = { client: { o7: { setTieOverride } } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const d = { event, standings: st }
    const root = document.createElement('div'); root.innerHTML = renderStandingsView(d)
    standingsScreen.mount!(root, ctx as any, d)
    return { root, setTieOverride, refresh }
  }

  it('shows a note + a resolve panel for an unresolved group', () => {
    const { root } = mountWith(tied)
    const body = root.querySelector('#stbody')!.innerHTML
    expect(body).toContain('Parità da definire')
    expect(root.querySelector('.pf-tiepanel')).not.toBeNull()
    expect(root.querySelectorAll('.pf-tieitem').length).toBe(2)
  })

  it('Salva ordine calls o7.setTieOverride with the current order, then refresh', async () => {
    const { root, setTieOverride, refresh } = mountWith(tied)
    ;(root.querySelector('.pf-tiepanel .js-tiesave') as HTMLButtonElement).click()
    await Promise.resolve(); await Promise.resolve()
    expect(setTieOverride).toHaveBeenCalledWith('e1', 'U10', 'Girone A', ['Alfa', 'Bravo'])
    expect(refresh).toHaveBeenCalled()
  })

  it('↑/↓ reorders before saving', async () => {
    const { root, setTieOverride } = mountWith(tied)
    // Move Bravo (2nd) up → order becomes [Bravo, Alfa]
    ;(root.querySelectorAll('.pf-tieitem')[1]!.querySelector('.js-tieup') as HTMLButtonElement).click()
    ;(root.querySelector('.pf-tiepanel .js-tiesave') as HTMLButtonElement).click()
    await Promise.resolve(); await Promise.resolve()
    expect(setTieOverride).toHaveBeenCalledWith('e1', 'U10', 'Girone A', ['Bravo', 'Alfa'])
  })

  it('renders the audit line when an override is applied', () => {
    const resolved: GroupStanding[] = [{ categoryId: 'U10', groupLabel: 'Girone A', rows: rows(['Bravo', 'Alfa']), unresolved: [], override: { order: ['Bravo', 'Alfa'], resolvedBy: 'auth0|org1', resolvedAt: '2026-08-19T10:30:00.000Z' } }]
    const { root } = mountWith(resolved)
    const body = root.querySelector('#stbody')!.innerHTML
    expect(body).toContain('Parità risolta manualmente')
    expect(body).toContain('auth0|org1')
    expect(body).toContain('2026-08-19 10:30')
    expect(root.querySelector('.pf-tiepanel')).toBeNull() // no resolve panel once resolved
  })
})
