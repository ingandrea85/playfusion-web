import { describe, it, expect } from 'vitest'
import type { CategoryFinalStanding, RegistrationWindowView, ScheduledMatchView } from '@playfusion/rest-client'
import { derivePhase, enrollmentByCategory, eventSummary, matchProgress, progressByDay, progressByField } from '../src/views/dashboard-data'
import { capacityBars, dayColumns, donut, statTiles } from '../src/views/dashboard-charts'
import { renderWorkspace, type OverviewData } from '../src/views/workspace'

const m = (o: Partial<ScheduledMatchView>): ScheduledMatchView => ({
  id: 'm', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'A',
  day: '2026-09-01', time: '10:00', field: 'Campo 1', home: 'H', away: 'A', ...o,
})
const ev = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published' as const, playbook: 'PB-1' as const }

describe('dashboard-data — derivePhase', () => {
  it('PREP when there are no group matches', () => {
    expect(derivePhase([])).toBe('PREP')
  })
  it('PREP when matches exist but none has a result', () => {
    expect(derivePhase([m({ id: '1' }), m({ id: '2' })])).toBe('PREP')
  })
  it('LIVE when some group matches are played but not all', () => {
    expect(derivePhase([m({ id: '1', homeScore: 1, awayScore: 0 }), m({ id: '2' })])).toBe('LIVE')
  })
  it('LIVE when group is done but a final is still pending', () => {
    const done = m({ id: '1', homeScore: 1, awayScore: 0 })
    const pendingFinal = m({ id: 'f', phase: 'FINAL' })
    expect(derivePhase([done, pendingFinal])).toBe('LIVE')
  })
  it('DONE when every group match and every final has a result', () => {
    const done = m({ id: '1', homeScore: 1, awayScore: 0 })
    const final = m({ id: 'f', phase: 'FINAL', homeScore: 2, awayScore: 1 })
    expect(derivePhase([done, final])).toBe('DONE')
  })
  it('ignores cancelled matches when deriving phase', () => {
    const played = m({ id: '1', homeScore: 1, awayScore: 0 })
    const cancelled = m({ id: '2', status: 'CANCELLED' })
    expect(derivePhase([played, cancelled])).toBe('DONE')
  })
})

describe('dashboard-data — progress', () => {
  it('matchProgress counts only fully-scored group matches, rounds pct', () => {
    const ms = [m({ id: '1', homeScore: 1, awayScore: 0 }), m({ id: '2', homeScore: 0, awayScore: null }), m({ id: '3' })]
    expect(matchProgress(ms)).toEqual({ played: 1, total: 3, pct: 33 })
  })
  it('matchProgress excludes finals from the total', () => {
    const ms = [m({ id: '1', homeScore: 1, awayScore: 0 }), m({ id: 'f', phase: 'FINAL' })]
    expect(matchProgress(ms)).toEqual({ played: 1, total: 1, pct: 100 })
  })
  it('matchProgress is 0/0 → pct 0 with no matches', () => {
    expect(matchProgress([])).toEqual({ played: 0, total: 0, pct: 0 })
  })
  it('progressByDay groups by day, sorted ascending', () => {
    const ms = [
      m({ id: '1', day: '2026-09-02', homeScore: 1, awayScore: 0 }),
      m({ id: '2', day: '2026-09-01', homeScore: 2, awayScore: 2 }),
      m({ id: '3', day: '2026-09-01' }),
    ]
    expect(progressByDay(ms)).toEqual([
      { day: '2026-09-01', played: 1, total: 2 },
      { day: '2026-09-02', played: 1, total: 1 },
    ])
  })
  it('progressByField flags a field behind only when ≥15 points below overall', () => {
    // overall: 5/6 ≈ 83%. Campo 2 at 1/3 ≈ 33% → behind; Campo 1 at 4/3? build explicitly.
    const ms = [
      m({ id: 'a1', field: 'Campo 1', homeScore: 1, awayScore: 0 }),
      m({ id: 'a2', field: 'Campo 1', homeScore: 1, awayScore: 0 }),
      m({ id: 'a3', field: 'Campo 1', homeScore: 1, awayScore: 0 }),
      m({ id: 'b1', field: 'Campo 2', homeScore: 1, awayScore: 0 }),
      m({ id: 'b2', field: 'Campo 2' }),
      m({ id: 'b3', field: 'Campo 2' }),
    ]
    const rows = progressByField(ms)
    expect(rows.map((r) => r.field)).toEqual(['Campo 1', 'Campo 2'])
    expect(rows[0]).toMatchObject({ field: 'Campo 1', behind: false })
    expect(rows[1]).toMatchObject({ field: 'Campo 2', played: 1, total: 3, behind: true })
  })
})

describe('dashboard-data — enrollment & summary', () => {
  it('enrollmentByCategory maps window categories to count/cap', () => {
    const w: RegistrationWindowView = { sportEventId: 'e1', state: 'Open', categories: [{ categoria: 'U10', cap: 8, count: 8, remaining: 0 }, { categoria: 'U12', cap: 8, count: 3, remaining: 5 }] }
    expect(enrollmentByCategory(w)).toEqual([{ categoria: 'U10', count: 8, cap: 8 }, { categoria: 'U12', count: 3, cap: 8 }])
  })
  it('enrollmentByCategory is [] when the window is unavailable', () => {
    expect(enrollmentByCategory(null)).toEqual([])
  })
  it('eventSummary sums goals over played group matches and resolves champions', () => {
    const ms = [
      m({ id: '1', homeScore: 3, awayScore: 1 }),
      m({ id: '2', homeScore: 0, awayScore: 2 }),
      m({ id: '3' }),
      m({ id: 'f', phase: 'FINAL', homeScore: 5, awayScore: 5 }),
    ]
    const fs: CategoryFinalStanding[] = [{ categoryId: 'U10', rows: [{ position: 1, team: 'Falchi' }, { position: 2, team: 'Lupi' }] }]
    expect(eventSummary(ms, fs)).toEqual({ matches: 2, goals: 6, champions: [{ categoryId: 'U10', team: 'Falchi' }] })
  })
  it('eventSummary omits an undecided champion (pending podium)', () => {
    const fs: CategoryFinalStanding[] = [{ categoryId: 'U10', rows: [{ position: 1, pending: 'result' }] }]
    expect(eventSummary([], fs).champions).toEqual([])
  })
})

describe('dashboard-charts builders', () => {
  it('donut draws the arc for the given pct and shows the centre labels', () => {
    const html = donut(75, '75%', '3/4 partite')
    expect(html).toContain('75%')
    expect(html).toContain('3/4 partite')
    expect(html).toContain('stroke-dashoffset')
  })
  it('capacityBars applies full/behind modifiers and the note text', () => {
    const html = capacityBars([
      { label: 'U10', value: 8, max: 8, state: 'full' },
      { label: 'Campo 2', value: 1, max: 3, note: '1/3 · indietro', state: 'behind' },
    ])
    expect(html).toContain('pf-capbar__fill--full')
    expect(html).toContain('pf-capbar__fill--behind')
    expect(html).toContain('1/3 · indietro')
  })
  it('dayColumns renders a dd/mm label per day', () => {
    expect(dayColumns([{ day: '2026-09-01', played: 1, total: 2 }])).toContain('01/09')
  })
  it('statTiles renders each figure', () => {
    const html = statTiles([{ big: '12', label: 'Partite giocate' }])
    expect(html).toContain('12')
    expect(html).toContain('Partite giocate')
  })
})

describe('renderWorkspace — phase-aware band', () => {
  const overview = (matches: ScheduledMatchView[], window: OverviewData['window'] = null, finalStandings: CategoryFinalStanding[] = []): OverviewData => ({ matches, window, finalStandings })

  it('renders without a band when no overview data is passed (back-compat)', () => {
    const html = renderWorkspace(ev, 'overview')
    expect(html).not.toContain('pf-dashband')
    expect(html).toContain('pf-whero')
  })
  it('PREP band shows enrollment capacity bars and the "In preparazione" phase', () => {
    const w: RegistrationWindowView = { sportEventId: 'e1', state: 'Open', categories: [{ categoria: 'U10', cap: 8, count: 8, remaining: 0 }] }
    const html = renderWorkspace(ev, 'overview', overview([m({ id: '1' })], w))
    expect(html).toContain('Iscrizioni per categoria')
    expect(html).toContain('In preparazione')
    expect(html).toContain('pf-capbar__fill--full')
  })
  it('LIVE band shows the progress donut, per-day and per-field charts', () => {
    const html = renderWorkspace(ev, 'overview', overview([m({ id: '1', homeScore: 1, awayScore: 0 }), m({ id: '2' })]))
    expect(html).toContain('Avanzamento partite')
    expect(html).toContain('Partite per giornata')
    expect(html).toContain('Avanzamento per campo')
    expect(html).toContain('In corso')
  })
  it('DONE band shows the summary tiles and the champion', () => {
    const fs: CategoryFinalStanding[] = [{ categoryId: 'U10', rows: [{ position: 1, team: 'Falchi' }] }]
    const html = renderWorkspace(ev, 'overview', overview([m({ id: 'g', homeScore: 3, awayScore: 0 }), m({ id: 'f', homeScore: 2, awayScore: 1, phase: 'FINAL' })], null, fs))
    expect(html).toContain('Riepilogo')
    expect(html).toContain('Falchi')
    expect(html).toContain('Concluso')
  })
})
