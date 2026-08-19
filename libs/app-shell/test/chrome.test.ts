// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderOrganizerTopbar, renderOrganizerWorkspace, renderPublicTopbar, renderCategoryTag } from '../src/chrome'

describe('chrome', () => {
  it('organizer topbar marks the active nav item', () => {
    const html = renderOrganizerTopbar('dashboard')
    expect(html).toContain('class="pf-topbar"')
    expect(html).toMatch(/aria-current="page"/)
  })
  it('workspace renders the event name, phase and every tab, marking the active one', () => {
    const html = renderOrganizerWorkspace(
      { name: 'Torneo X', meta: 'calcio · Roma', phaseLabel: 'In corso', phaseMod: 'live' },
      [{ key: 'overview', label: 'Panoramica', href: '#/events/e1' }, { key: 'enroll', label: 'Iscrizioni', href: '#/events/e1/enroll' }],
      'overview',
    )
    expect(html).toContain('Torneo X')
    expect(html).toContain('pf-wphase--live')
    expect(html).toContain('Panoramica')
    expect(html).toContain('Iscrizioni')
    expect(html).toContain('pf-wtab--active')
  })
  it('public topbar accepts a brand override', () => {
    expect(renderPublicTopbar('<b>ACME</b>')).toContain('ACME')
  })
  it('category tag shows count/max and a full modifier when at capacity', () => {
    expect(renderCategoryTag('U10', 8, 8)).toContain('pf-cat--full')
    expect(renderCategoryTag('U12', 2, 8)).toContain('2/8')
  })
})

import { renderTabs, categoryKeys, groupKeys } from '../src/chrome'
describe('S23 tabs', () => {
  it('renderTabs marks the active tab and carries data-key', () => {
    const html = renderTabs([{ key: 'U10', label: 'U10' }, { key: 'U12', label: 'U12' }], 'U12')
    expect(html).toContain('data-key="U10"')
    expect(html).toMatch(/data-key="U12"[^>]*pf-tab--active|pf-tab--active[^>]*data-key="U12"/)
    expect(html).toContain('aria-selected="true"')
  })
  it('renderTabs is empty for no items', () => { expect(renderTabs([], 'x')).toBe('') })
  it('categoryKeys/groupKeys derive distinct keys in order', () => {
    const items = [{ categoryId: 'U10', groupLabel: 'Girone A' }, { categoryId: 'U10', groupLabel: 'Girone B' }, { categoryId: 'U12', groupLabel: 'Girone A' }]
    expect(categoryKeys(items)).toEqual(['U10', 'U12'])
    expect(groupKeys(items, 'U10')).toEqual(['Girone A', 'Girone B'])
  })
})

import { displayStatus, matchStatusBadge, matchDelayLabel, openSheet, renderCalendar } from '../src/chrome'
describe('S26 match lifecycle badges + delay', () => {
  const base = { categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'Campo A', home: 'A', away: 'B' }
  it('displayStatus uses explicit status, falls back to FINISHED when a statusless match has scores', () => {
    expect(displayStatus({ ...base, status: 'LIVE' })).toBe('LIVE')
    expect(displayStatus({ ...base, homeScore: 1, awayScore: 0 })).toBe('FINISHED') // legacy fallback
    expect(displayStatus(base)).toBe('SCHEDULED')
  })
  it('badge reflects status with a live dot', () => {
    expect(matchStatusBadge({ ...base, status: 'LIVE' })).toContain('pf-mstatus--live')
    expect(matchStatusBadge({ ...base, status: 'LIVE' })).toContain('In corso')
    expect(matchStatusBadge({ ...base, status: 'CANCELLED' })).toContain('Annullata')
  })
  it('delay label: scheduled past its slot is late; live started late shows +N; on-time is null', () => {
    const now = new Date('2026-09-01T09:12:00')
    expect(matchDelayLabel({ ...base }, now)).toBe('in ritardo 12′')
    expect(matchDelayLabel({ ...base, status: 'LIVE', startedAt: '2026-09-01T09:07:00' }, new Date('2026-09-01T09:20:00'))).toBe('iniziata +7′')
    expect(matchDelayLabel({ ...base }, new Date('2026-09-01T08:55:00'))).toBeNull()
  })
  it('renderCalendar marks a cancelled match and shows badges', () => {
    const html = renderCalendar([{ ...base, id: 'm1', status: 'CANCELLED' }], (id) => id, false, { now: new Date('2026-09-01T09:00:00') })
    expect(html).toContain('pf-match--cancelled')
    expect(html).toContain('Annullata')
  })
  it('hideScheduledBadge suppresses the SCHEDULED pill but keeps LIVE/FINISHED', () => {
    const now = new Date('2026-09-01T08:00:00')
    expect(renderCalendar([{ ...base, id: 'a' }], (id) => id, false, { now, hideScheduledBadge: true })).not.toContain('Programmata')
    expect(renderCalendar([{ ...base, id: 'b', status: 'LIVE' }], (id) => id, false, { now, hideScheduledBadge: true })).toContain('In corso')
  })
})

describe('S26 bottom sheet', () => {
  it('mounts a bottom sheet and closes on backdrop click', () => {
    const host = document.createElement('div')
    const { el, close } = openSheet(host, '<p>ciao</p>')
    expect(el.textContent).toContain('ciao')
    expect(host.querySelector('.pf-sheet-overlay')).not.toBeNull()
    host.querySelector<HTMLElement>('.pf-sheet-overlay')!.click() // backdrop
    expect(host.querySelector('.pf-sheet-overlay')).toBeNull()
    close() // idempotent
  })
})

import { renderStepper, wireSteppers, readStepper } from '../src/chrome'
describe('S25 score stepper', () => {
  it('renders a +/- stepper and reads/updates the value (clamped at 0)', () => {
    const root = document.createElement('div')
    root.innerHTML = renderStepper('home', 'Casa', 2)
    wireSteppers(root)
    expect(readStepper(root, 'home')).toBe(2)
    root.querySelector<HTMLButtonElement>('[data-step="home"][data-delta="1"]')!.click()
    expect(readStepper(root, 'home')).toBe(3)
    const minus = root.querySelector<HTMLButtonElement>('[data-step="home"][data-delta="-1"]')!
    minus.click(); minus.click(); minus.click(); minus.click() // 3 → 0, then clamp
    expect(readStepper(root, 'home')).toBe(0)
  })
})

import { renderBracket, needsWinnerDecision, winnerSide } from '../src/chrome'

describe('finals winner highlight + decide badge (chrome)', () => {
  const cat = (c: string) => c
  const base = { categoryId: 'U10', bracketLabel: 'Tabellone', round: 'F', order: 1, home: '1ª Girone A', away: '2ª Girone A', homeResolved: 'Alfa', awayResolved: 'Bravo', phase: 'FINAL' as const }
  it('winnerSide by score, by decree on draw, none if undecided', () => {
    expect(winnerSide({ ...base, status: 'FINISHED', homeScore: 2, awayScore: 1 })).toBe('HOME')
    expect(winnerSide({ ...base, status: 'FINISHED', homeScore: 0, awayScore: 0, decidedWinner: 'AWAY' })).toBe('AWAY')
    expect(winnerSide({ ...base, status: 'FINISHED', homeScore: 0, awayScore: 0 })).toBeNull()
    expect(winnerSide({ ...base, status: 'SCHEDULED' })).toBeNull()
  })
  it('renderBracket highlights the winner of a finished final', () => {
    const html = renderBracket([{ ...base, status: 'FINISHED', homeScore: 3, awayScore: 1 }], cat)
    expect(html).toContain('pf-brk__win')
    expect(html).toContain('✓ Alfa')
  })
  it('renderBracket shows "Chi passa?" on a drawn final without a decree', () => {
    const html = renderBracket([{ ...base, status: 'FINISHED', homeScore: 1, awayScore: 1 }], cat)
    expect(html).toContain('Chi passa?')
    expect(needsWinnerDecision({ phase: 'FINAL', status: 'FINISHED', homeScore: 1, awayScore: 1 })).toBe(true)
    expect(needsWinnerDecision({ phase: 'FINAL', status: 'FINISHED', homeScore: 1, awayScore: 1, decidedWinner: 'HOME' })).toBe(false)
    expect(needsWinnerDecision({ phase: 'GROUP', status: 'FINISHED', homeScore: 1, awayScore: 1 })).toBe(false)
  })
})

describe('bracket tree vs list (S13)', () => {
  const cat = (c: string) => c
  const m = (round: string, order: number, home: string, away: string, over: any = {}) =>
    ({ categoryId: 'U10', bracketLabel: 'Tabellone', round, order, home, away, phase: 'FINAL' as const, ...over })
  it('multi-round knockout renders a graphical tree + a mobile list fallback', () => {
    const finals = [
      m('SF', 1, 'Vincente QF1', 'Vincente QF2'), m('SF', 2, 'Vincente QF3', 'Vincente QF4'),
      m('F', 1, 'Vincente SF1', 'Vincente SF2'),
    ]
    const html = renderBracket(finals, cat)
    expect(html).toContain('pf-brk-tree')       // graphical tree present
    expect(html).toContain('pf-brk__col')
    expect(html).toContain('pf-brk-fallback')    // mobile list fallback present
    expect(html).toContain('Semifinali')         // round header mapped
  })
  it('single-match placement finals render as a list (no tree)', () => {
    const finals = [
      { categoryId: 'U10', bracketLabel: 'Finali', round: 'Finale 1º/2º', order: 1, home: '1ª Girone A', away: '2ª Girone A', phase: 'FINAL' as const },
      { categoryId: 'U10', bracketLabel: 'Finali', round: 'Finale 3º/4º', order: 2, home: '3ª Girone A', away: '4ª Girone A', phase: 'FINAL' as const },
    ]
    const html = renderBracket(finals, cat)
    expect(html).not.toContain('pf-brk-tree')
    expect(html).toContain('pf-brk__list')
  })
})

describe('bracket full classification (S13)', () => {
  const cat = (c: string) => c
  it('renders the main path as a tree and the placement finals as a list below', () => {
    const finals = [
      { categoryId: 'U10', bracketLabel: 'Tabellone', round: 'SF', order: 1, slot: 'T1SF1', home: 'Vincente A', away: 'Vincente B', phase: 'FINAL' as const },
      { categoryId: 'U10', bracketLabel: 'Tabellone', round: 'SF', order: 2, slot: 'T1SF2', home: 'Vincente C', away: 'Vincente D', phase: 'FINAL' as const },
      { categoryId: 'U10', bracketLabel: 'Tabellone', round: 'F', order: 3, slot: 'T1WF', home: 'Vincente T1SF1', away: 'Vincente T1SF2', phase: 'FINAL' as const },
      { categoryId: 'U10', bracketLabel: 'Tabellone', round: 'Finale 3º/4º', order: 4, slot: 'T1WLF', home: 'Perdente T1SF1', away: 'Perdente T1SF2', phase: 'FINAL' as const },
    ]
    const html = renderBracket(finals, cat)
    expect(html).toContain('pf-brk-tree')        // main path is a graphical tree
    expect(html).toContain('pf-brk-placements')  // placement finals listed below
    expect(html).toContain('Piazzamenti')
    expect(html).toContain('Finale 3º/4º')        // the placement round header
  })
})
