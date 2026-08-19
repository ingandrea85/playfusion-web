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
const data = (status: ScheduleView['status'], matches: ScheduledMatchView[] = [], config = cfg): ScheduleData =>
  ({ event, schedule: { sportEventId: 'e1', organizationId: 'org', status, config }, matches })

describe('schedule render', () => {
  it('shows the facility + play config and the Calendario tab, no calendar/actions when NONE', () => {
    const html = renderSchedule(data('NONE'))
    expect(html).toContain('Finestra impianto')
    expect(html).toContain('Config di gioco')
    expect(html).toContain('id="sameForAll"')
    expect(html).toContain('id="generate"')
    expect(html).toContain('/schedule')
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
    expect(html).toContain('configurazione bloccata')
    expect(html).not.toContain('id="generate"')
    expect(html).toMatch(/id="publish"(?![^>]*disabled)/)
  })

  it('starts in per-category mode when the config carries byCategory', () => {
    const perCat = { ...cfg, byCategory: { U10: { fields: ['Campo Nord'], periods: 1, periodMinutes: 10, breakMinutes: 0, legs: 'SINGLE' as const } } }
    const html = renderSchedule(data('NONE', [], perCat))
    expect(html).toMatch(/id="sameForAll"(?![^>]*checked)/) // toggle OFF
    expect(html).toContain('data-cat="U10"')
    expect(html).toContain('data-cat="U12"')
  })
})

describe('schedule generate', () => {
  const mountWith = (status: ScheduleView['status'], config = cfg) => {
    const o7 = { generateSchedule: vi.fn().mockResolvedValue({}), approveSchedule: vi.fn().mockResolvedValue({}), publishSchedule: vi.fn().mockResolvedValue({}), rescheduleMatch: vi.fn().mockResolvedValue({}) }
    const refresh = vi.fn()
    const ctx = { client: { o7 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const d = data(status, status === 'NONE' ? [] : [match], config)
    const root = document.createElement('div'); root.innerHTML = renderSchedule(d)
    scheduleScreen.mount!(root, ctx as any, d)
    return { root, o7, refresh }
  }

  it('ON mode: generate sends a flat config (fields/legs from the single card, no byCategory)', async () => {
    const { root, o7, refresh } = mountWith('NONE')
    ;(root.querySelector('.cfg-legs') as HTMLSelectElement).value = 'HOME_AWAY'
    root.querySelector<HTMLButtonElement>('#generate')!.click()
    await vi.waitFor(() => expect(o7.generateSchedule).toHaveBeenCalled())
    const [idArg, config] = o7.generateSchedule.mock.calls[0]
    expect(idArg).toBe('e1')
    // groupsCount is no longer a calendar input — it's preserved from the stored config (1).
    expect(config).toMatchObject({ groupsCount: 1, legs: 'HOME_AWAY', fields: ['Campo A', 'Campo B'] })
    expect(config.byCategory).toBeUndefined()
    expect(refresh).toHaveBeenCalled()
  })

  it('does not render a groupsCount input (gironi are set in the Gironi tab)', () => {
    const { root } = mountWith('NONE')
    expect(root.querySelector('#groupsCount')).toBeNull()
    expect(root.innerHTML).toContain('tab <b>Gironi</b>')
  })

  it('per-category mode: toggling off yields a card per category; generate sends byCategory', async () => {
    const { root, o7 } = mountWith('NONE')
    const toggle = root.querySelector('#sameForAll') as HTMLInputElement
    toggle.checked = false
    toggle.dispatchEvent(new Event('change'))
    const cards = root.querySelectorAll('.js-playcard')
    expect(cards.length).toBe(2) // U10, U12
    // customise U12
    const u12 = root.querySelector('.js-playcard[data-cat="U12"]')!
    ;(u12.querySelector('.cfg-fields') as HTMLInputElement).value = 'Campo Sud'
    ;(u12.querySelector('.cfg-legs') as HTMLSelectElement).value = 'HOME_AWAY'
    root.querySelector<HTMLButtonElement>('#generate')!.click()
    await vi.waitFor(() => expect(o7.generateSchedule).toHaveBeenCalled())
    const [, config] = o7.generateSchedule.mock.calls[0]
    expect(config.byCategory.U10).toMatchObject({ fields: ['Campo A', 'Campo B'] })
    expect(config.byCategory.U12).toMatchObject({ fields: ['Campo Sud'], legs: 'HOME_AWAY' })
  })

  it('blocks generate with an inline error when a category has no field', async () => {
    const { root, o7 } = mountWith('NONE')
    ;(root.querySelector('.cfg-fields') as HTMLInputElement).value = '  '
    root.querySelector<HTMLButtonElement>('#generate')!.click()
    await vi.waitFor(() => expect(root.querySelector('#err')!.innerHTML).toContain('almeno un campo'))
    expect(o7.generateSchedule).not.toHaveBeenCalled()
  })
})

describe('schedule status + reschedule', () => {
  const mountWith = (status: ScheduleView['status'], reschedule = vi.fn().mockResolvedValue({})) => {
    const o7 = { generateSchedule: vi.fn(), approveSchedule: vi.fn().mockResolvedValue({}), publishSchedule: vi.fn().mockResolvedValue({}), rescheduleMatch: reschedule }
    const refresh = vi.fn()
    const ctx = { client: { o7 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const d = data(status, [match])
    const root = document.createElement('div'); root.innerHTML = renderSchedule(d)
    scheduleScreen.mount!(root, ctx as any, d)
    return { root, o7, refresh }
  }

  it('approve then publish call the o7 seam', async () => {
    const g = mountWith('GENERATED')
    g.root.querySelector<HTMLButtonElement>('#approve')!.click()
    await vi.waitFor(() => expect(g.o7.approveSchedule).toHaveBeenCalledWith('e1'))
    const a = mountWith('APPROVED')
    a.root.querySelector<HTMLButtonElement>('#publish')!.click()
    await vi.waitFor(() => expect(a.o7.publishSchedule).toHaveBeenCalledWith('e1'))
  })

  it('Modifica → Salva reschedules a match; 409 shows a conflict notice', async () => {
    const ok = mountWith('GENERATED')
    ok.root.querySelector<HTMLButtonElement>('.js-editmatch')!.click()
    ;(ok.root.querySelector('#rs-time') as HTMLInputElement).value = '11:00'
    ok.root.querySelector<HTMLButtonElement>('#rs-save')!.click()
    await vi.waitFor(() => expect(ok.o7.rescheduleMatch).toHaveBeenCalledWith('e1', 'sm-1', expect.objectContaining({ time: '11:00' })))

    const conflict = mountWith('GENERATED', vi.fn().mockRejectedValue({ status: 409 }))
    conflict.root.querySelector<HTMLButtonElement>('.js-editmatch')!.click()
    conflict.root.querySelector<HTMLButtonElement>('#rs-save')!.click()
    await vi.waitFor(() => expect(conflict.root.querySelector('#err')!.innerHTML).toContain('Slot già occupato'))
  })

  it('reschedule is available even when PUBLISHED', () => {
    const { root } = mountWith('PUBLISHED')
    root.querySelector<HTMLButtonElement>('.js-editmatch')!.click()
    expect(root.querySelector('#rs-save')).not.toBeNull()
  })
})
