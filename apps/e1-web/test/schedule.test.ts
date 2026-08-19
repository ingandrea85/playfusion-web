// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { EventDetail, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { renderSchedule, scheduleScreen, type ScheduleData } from '../src/views/schedule'

const event: EventDetail = {
  sportEventId: 'e1', sport: 'Calcio', categorie: ['U10', 'U12'],
  dates: { from: '2026-08-29', to: '2026-08-30' }, status: 'Published', playbook: 'PB-1', name: 'Torneo',
}
const cfg: ScheduleView['config'] = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE' }
const match: ScheduledMatchView = { id: 'sm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-08-29', time: '09:00', field: 'Campo A', home: 'A', away: 'B' }
const data = (status: ScheduleView['status'], matches: ScheduledMatchView[] = []): ScheduleData =>
  ({ event, schedule: { sportEventId: 'e1', organizationId: 'org', status, config: cfg }, matches })

describe('schedule render', () => {
  it('shows the config form and the Calendario tab, no calendar/actions when NONE', () => {
    const html = renderSchedule(data('NONE'))
    expect(html).toContain('Configurazione')
    expect(html).toContain('id="generate"')
    expect(html).toContain('/schedule') // Calendario tab href
    expect(html).toContain('Genera il calendario') // NONE actions hint
    expect(html).not.toContain('id="approve"')
  })

  it('renders the calendar and enables Approva when GENERATED', () => {
    const html = renderSchedule(data('GENERATED', [match]))
    expect(html).toContain('Girone A')
    expect(html).toContain('<b>vs</b>')
    expect(html).toMatch(/id="approve"(?![^>]*disabled)/)
    expect(html).toMatch(/id="publish"[^>]*disabled/)
  })

  it('locks the config and enables Pubblica when APPROVED', () => {
    const html = renderSchedule(data('APPROVED', [match]))
    expect(html).toContain('configurazione è bloccata')
    expect(html).not.toContain('id="generate"')
    expect(html).toMatch(/id="publish"(?![^>]*disabled)/)
  })

  it('shows Pubblicato when PUBLISHED', () => {
    expect(renderSchedule(data('PUBLISHED', [match]))).toContain('Pubblicato')
  })
})

describe('schedule mount', () => {
  const mountWith = (status: ScheduleView['status']) => {
    const o7 = {
      generateSchedule: vi.fn().mockResolvedValue({}),
      approveSchedule: vi.fn().mockResolvedValue({}),
      publishSchedule: vi.fn().mockResolvedValue({}),
      rescheduleMatch: vi.fn().mockResolvedValue({}),
    }
    const refresh = vi.fn()
    const ctx = { client: { o7 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const d = data(status, status === 'NONE' ? [] : [match])
    const root = document.createElement('div'); root.innerHTML = renderSchedule(d)
    scheduleScreen.mount!(root, ctx as any, d)
    return { root, o7, refresh }
  }

  it('generate collects the config (incl. groups/legs) and calls o7 then refresh', async () => {
    const { root, o7, refresh } = mountWith('NONE')
    ;(root.querySelector('#groupsCount') as HTMLInputElement).value = '2'
    ;(root.querySelector('#legs') as HTMLSelectElement).value = 'HOME_AWAY'
    root.querySelector<HTMLButtonElement>('#generate')!.click()
    await vi.waitFor(() => expect(o7.generateSchedule).toHaveBeenCalled())
    const [id, config] = o7.generateSchedule.mock.calls[0]
    expect(id).toBe('e1')
    expect(config).toMatchObject({ groupsCount: 2, legs: 'HOME_AWAY', fields: ['Campo A', 'Campo B'] })
    expect(refresh).toHaveBeenCalled()
  })

  it('approve calls o7.approveSchedule then refresh when GENERATED', async () => {
    const { root, o7, refresh } = mountWith('GENERATED')
    root.querySelector<HTMLButtonElement>('#approve')!.click()
    await vi.waitFor(() => expect(o7.approveSchedule).toHaveBeenCalledWith('e1'))
    expect(refresh).toHaveBeenCalled()
  })

  it('publish calls o7.publishSchedule when APPROVED', async () => {
    const { root, o7 } = mountWith('APPROVED')
    root.querySelector<HTMLButtonElement>('#publish')!.click()
    await vi.waitFor(() => expect(o7.publishSchedule).toHaveBeenCalledWith('e1'))
  })
})

describe('schedule reschedule (S9)', () => {
  const mountWith = (status: ScheduleView['status'], reschedule = vi.fn().mockResolvedValue({})) => {
    const o7 = { generateSchedule: vi.fn(), approveSchedule: vi.fn(), publishSchedule: vi.fn(), rescheduleMatch: reschedule }
    const refresh = vi.fn()
    const ctx = { client: { o7 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const d = data(status, [match])
    const root = document.createElement('div'); root.innerHTML = renderSchedule(d)
    scheduleScreen.mount!(root, ctx as any, d)
    return { root, o7, refresh }
  }

  it('renders a per-match Modifica control in the editable calendar', () => {
    expect(renderSchedule(data('GENERATED', [match]))).toContain('js-editmatch')
    // E3 default (non-editable) has no edit control
    expect(renderSchedule(data('NONE'))).not.toContain('js-editmatch')
  })

  it('Modifica opens a prefilled panel and Salva calls rescheduleMatch then refresh', async () => {
    const { root, o7, refresh } = mountWith('GENERATED')
    root.querySelector<HTMLButtonElement>('.js-editmatch')!.click()
    const day = root.querySelector('#rs-day') as HTMLInputElement
    expect(day.value).toBe('2026-08-29') // prefilled from the match
    day.value = '2026-08-30'
    ;(root.querySelector('#rs-time') as HTMLInputElement).value = '11:00'
    root.querySelector<HTMLButtonElement>('#rs-save')!.click()
    await vi.waitFor(() => expect(o7.rescheduleMatch).toHaveBeenCalled())
    const [id, matchId, patch] = o7.rescheduleMatch.mock.calls[0]
    expect(id).toBe('e1'); expect(matchId).toBe('sm-1')
    expect(patch).toMatchObject({ day: '2026-08-30', time: '11:00' })
    expect(refresh).toHaveBeenCalled()
  })

  it('surfaces a 409 slot conflict without refreshing', async () => {
    const conflict = vi.fn().mockRejectedValue({ status: 409, code: 'SLOT_CONFLICT' })
    const { root, refresh } = mountWith('GENERATED', conflict)
    root.querySelector<HTMLButtonElement>('.js-editmatch')!.click()
    root.querySelector<HTMLButtonElement>('#rs-save')!.click()
    await vi.waitFor(() => expect(root.querySelector('#err')!.innerHTML).toContain('Slot già occupato'))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('reschedule is available even when the schedule is PUBLISHED', () => {
    const { root } = mountWith('PUBLISHED')
    root.querySelector<HTMLButtonElement>('.js-editmatch')!.click()
    expect(root.querySelector('#rs-save')).not.toBeNull()
  })
})
