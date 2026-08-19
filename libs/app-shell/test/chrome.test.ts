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
    const html = renderCalendar([{ ...base, id: 'm1', status: 'CANCELLED' }], (id) => id, false, new Date('2026-09-01T09:00:00'))
    expect(html).toContain('pf-match--cancelled')
    expect(html).toContain('Annullata')
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
