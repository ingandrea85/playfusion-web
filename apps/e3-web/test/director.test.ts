// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { signMagicLink } from '@playfusion/platform-lib'
import type { EventDetail, ScheduledMatchView } from '@playfusion/rest-client'
import { renderDirector, wireDirector, directorScopeFromToken } from '../src/views/director'

const event: EventDetail = { sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published', playbook: 'PB-1', name: 'Torneo' }
const m = (id: string, field: string, home: string, away: string): ScheduledMatchView =>
  ({ id, sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field, home, away })
const matches = [m('s1', 'Campo A', 'A', 'B'), m('s2', 'Campo A', 'C', 'D'), m('s3', 'Campo B', 'E', 'F')]

describe('directorScopeFromToken', () => {
  it('decodes eventId + field from a director magic-link', () => {
    const token = signMagicLink({ subject: `director:e1:${encodeURIComponent('Campo A')}`, roles: ['director'], purpose: 'field-director' })
    expect(directorScopeFromToken(token)).toEqual({ eventId: 'e1', field: 'Campo A' })
  })
  it('returns null for a non-director token or missing token', () => {
    expect(directorScopeFromToken(null)).toBeNull()
    expect(directorScopeFromToken(signMagicLink({ subject: 'enroll:e1', roles: ['coach'] }))).toBeNull()
  })
})

describe('e3 director view (S26 lifecycle)', () => {
  it('shows only the field matches; scheduled match → Inizia → stepper → Salva records the result', async () => {
    const o7 = {
      startMatch: vi.fn().mockResolvedValue({ ...matches[0], status: 'LIVE', startedAt: '2026-09-01T09:05:00.000Z' }),
      recordResult: vi.fn().mockResolvedValue({ ...matches[0], status: 'LIVE', homeScore: 2, awayScore: 0 }),
      finishMatch: vi.fn().mockResolvedValue({ ...matches[0], status: 'FINISHED', homeScore: 2, awayScore: 0 }),
    } as any
    const root = document.createElement('div')
    root.innerHTML = renderDirector(event, 'Campo A', matches)
    wireDirector(root, o7, 'e1', 'Campo A', matches)
    const body = root.querySelector('#dir-body')!.innerHTML
    expect(body).toContain('A <b>vs</b> B')
    expect(body).toContain('C <b>vs</b> D')
    expect(body).not.toContain('E <b>vs</b> F') // Campo B hidden

    // tap a SCHEDULED match → sheet shows "Inizia partita" (no stepper yet)
    root.querySelector<HTMLButtonElement>('.js-dirmatch')!.click()
    expect(root.querySelector('#dir-start')).not.toBeNull()
    expect(root.querySelector('[data-step="home"]')).toBeNull()

    // Inizia → LIVE → sheet re-opens with the stepper
    root.querySelector<HTMLButtonElement>('#dir-start')!.click()
    await vi.waitFor(() => expect(o7.startMatch).toHaveBeenCalledWith('e1', 's1'))
    await vi.waitFor(() => expect(root.querySelector('[data-step="home"]')).not.toBeNull())

    // +2 → Salva → recordResult
    root.querySelector<HTMLButtonElement>('[data-step="home"][data-delta="1"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-step="home"][data-delta="1"]')!.click()
    root.querySelector<HTMLButtonElement>('#dir-save')!.click()
    await vi.waitFor(() => expect(o7.recordResult).toHaveBeenCalledWith('e1', 's1', { homeScore: 2, awayScore: 0 }))
    await vi.waitFor(() => expect(root.querySelector('#dir-body')!.innerHTML).toContain('2–0'))
  })

  it('a finished match is read-only for the director (Termina flow records then finishes)', async () => {
    const live = { ...matches[0], status: 'LIVE' as const, homeScore: 1, awayScore: 0 }
    const o7 = {
      recordResult: vi.fn().mockResolvedValue(live),
      finishMatch: vi.fn().mockResolvedValue({ ...live, status: 'FINISHED' }),
    } as any
    const root = document.createElement('div')
    root.innerHTML = renderDirector(event, 'Campo A', [live, matches[1]])
    wireDirector(root, o7, 'e1', 'Campo A', [live, matches[1]])
    // tap the LIVE match → Termina present
    root.querySelector<HTMLButtonElement>('.js-dirmatch')!.click()
    expect(root.querySelector('#dir-finish')).not.toBeNull()
    root.querySelector<HTMLButtonElement>('#dir-finish')!.click()
    await vi.waitFor(() => expect(o7.recordResult).toHaveBeenCalled())
    await vi.waitFor(() => expect(o7.finishMatch).toHaveBeenCalledWith('e1', 's1'))
    // tapping the now-finished match shows read-only (no stepper), no cancel action for director
    root.querySelector<HTMLButtonElement>('.js-dirmatch')!.click()
    expect(root.querySelector('[data-step="home"]')).toBeNull()
    expect(root.querySelector('#dir-void')).toBeNull()
  })
})

describe('director shows finals (S12)', () => {
  const fin: ScheduledMatchView = { id: 'fm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Tabellone', day: '2026-09-02', time: '10:00', field: 'Campo A', home: '1ª Girone A', away: '2ª Girone A', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'Finale', order: 1, homeResolved: 'Alfa', awayResolved: 'Bravo' }
  it('lists a FINAL match on the field with resolved names + round label', () => {
    const html = renderDirector(event, 'Campo A', [fin])
    expect(html).toContain('Alfa')
    expect(html).toContain('Bravo')
    expect(html).toContain('Finale')
    expect(html).not.toContain('1ª Girone A')
  })
})
