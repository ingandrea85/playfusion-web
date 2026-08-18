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
