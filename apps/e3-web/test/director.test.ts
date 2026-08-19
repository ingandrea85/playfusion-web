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

describe('e3 director view', () => {
  it('shows only the field matches; tapping one + stepper + Salva records the result', async () => {
    const o7 = { recordResult: vi.fn().mockResolvedValue({ ...matches[0], homeScore: 2, awayScore: 0 }) } as any
    const root = document.createElement('div')
    root.innerHTML = renderDirector(event, 'Campo A', matches)
    wireDirector(root, o7, 'e1', 'Campo A', matches)
    const body = root.querySelector('#dir-body')!.innerHTML
    expect(body).toContain('A <b>vs</b> B')
    expect(body).toContain('C <b>vs</b> D')
    expect(body).not.toContain('E <b>vs</b> F') // Campo B hidden
    // tap first match → stepper → 2-0 → save
    root.querySelector<HTMLButtonElement>('.js-dirmatch')!.click()
    root.querySelector<HTMLButtonElement>('[data-step="home"][data-delta="1"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-step="home"][data-delta="1"]')!.click()
    root.querySelector<HTMLButtonElement>('#dir-save')!.click()
    await vi.waitFor(() => expect(o7.recordResult).toHaveBeenCalledWith('e1', 's1', { homeScore: 2, awayScore: 0 }))
    await vi.waitFor(() => expect(root.querySelector('#dir-body')!.innerHTML).toContain('2–0'))
  })
})
