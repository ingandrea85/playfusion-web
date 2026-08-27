// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { EventDetail, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { renderSchedule, scheduleScreen, type ScheduleData } from '../src/views/schedule'

const event: EventDetail = {
  sportEventId: 'e1', sport: 'Calcio', categorie: ['U10', 'U12'],
  dates: { from: '2026-08-29', to: '2026-08-30' }, status: 'Published', playbook: 'PB-1', name: 'Torneo',
}
const cfg: ScheduleView['config'] = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' }
const match: ScheduledMatchView = { id: 'sm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-08-29', time: '09:00', field: 'Campo A', home: 'A', away: 'B' }
const data = (status: ScheduleView['status'], matches: ScheduledMatchView[] = [], config = cfg): ScheduleData =>
  ({ event, schedule: { sportEventId: 'e1', organizationId: 'org', status, config }, matches, finalsFormats: [] })

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
    const o7 = { generateSchedule: vi.fn().mockResolvedValue({}), approveSchedule: vi.fn().mockResolvedValue({}), publishSchedule: vi.fn().mockResolvedValue({}), rescheduleMatch: vi.fn().mockResolvedValue({}), recordResult: vi.fn().mockResolvedValue({}), getStandings: vi.fn().mockResolvedValue([]) }
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
    const o7 = { generateSchedule: vi.fn(), approveSchedule: vi.fn().mockResolvedValue({}), publishSchedule: vi.fn().mockResolvedValue({}), rescheduleMatch: reschedule, recordResult: vi.fn().mockResolvedValue({}), getStandings: vi.fn().mockResolvedValue([]) }
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

describe('schedule result entry (S10)', () => {
  const mountWith = (record = vi.fn().mockResolvedValue({})) => {
    const o7 = { generateSchedule: vi.fn(), approveSchedule: vi.fn(), publishSchedule: vi.fn(), rescheduleMatch: vi.fn(), recordResult: record, getStandings: vi.fn().mockResolvedValue([]) }
    const refresh = vi.fn()
    const ctx = { client: { o7 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const d = data('GENERATED', [match])
    const root = document.createElement('div'); root.innerHTML = renderSchedule(d)
    scheduleScreen.mount!(root, ctx as any, d)
    return { root, o7, refresh }
  }

  it('renders a Risultato control per match and shows scores when played', () => {
    const html = renderSchedule(data('GENERATED', [{ ...match, homeScore: 2, awayScore: 1 }]))
    expect(html).toContain('js-resultmatch')
    expect(html).toContain('2–1') // score on the row
  })

  const tap = (root: HTMLElement, id: string, delta: 1 | -1, n: number) => {
    const b = root.querySelector<HTMLButtonElement>(`[data-step="${id}"][data-delta="${delta}"]`)!
    for (let i = 0; i < n; i++) b.click()
  }

  it('Risultato → +/- stepper → Salva records the result then refreshes', async () => {
    const { root, o7, refresh } = mountWith()
    root.querySelector<HTMLButtonElement>('.js-resultmatch')!.click()
    tap(root, 'home', 1, 3) // 0 → 3
    tap(root, 'away', 1, 1) // 0 → 1
    root.querySelector<HTMLButtonElement>('#rr-save')!.click()
    await vi.waitFor(() => expect(o7.recordResult).toHaveBeenCalledWith('e1', 'sm-1', { homeScore: 3, awayScore: 1 }))
    expect(refresh).toHaveBeenCalled()
  })

  it('stepper clamps at 0 (minus below zero stays 0)', () => {
    const { root } = mountWith()
    root.querySelector<HTMLButtonElement>('.js-resultmatch')!.click()
    tap(root, 'home', -1, 2) // already 0 → stays 0
    expect(root.querySelector('#stp-home')!.textContent).toBe('0')
  })
})

describe('schedule category/girone tabs (S23)', () => {
  const m2 = (id: string, cat: string, grp: string, home: string, away: string): ScheduledMatchView =>
    ({ id, sportEventId: 'e1', categoryId: cat, groupLabel: grp, day: '2026-08-29', time: '09:00', field: 'C', home, away })
  const matches = [m2('s1', 'U10', 'Girone A', 'A', 'B'), m2('s2', 'U10', 'Girone B', 'C', 'D'), m2('s3', 'U12', 'Girone A', 'E', 'F')]
  const mount = () => {
    const o7 = { generateSchedule: vi.fn(), approveSchedule: vi.fn(), publishSchedule: vi.fn(), rescheduleMatch: vi.fn(), recordResult: vi.fn(), getStandings: vi.fn() }
    const ctx = { client: { o7 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh: vi.fn() }
    const d = data('GENERATED', matches)
    const root = document.createElement('div'); root.innerHTML = renderSchedule(d)
    scheduleScreen.mount!(root, ctx as any, d)
    return root
  }

  it('defaults to the first category (all gironi) and offers category + girone tabs', () => {
    const root = mount()
    const calbody = root.querySelector('#calbody')!.innerHTML
    expect(calbody).toContain('A <b>vs</b> B') // U10 Girone A
    expect(calbody).toContain('C <b>vs</b> D') // U10 Girone B
    expect(calbody).not.toContain('E <b>vs</b> F') // U12 hidden
    expect(root.querySelector('#cal-cattabs')!.innerHTML).toContain('data-key="U12"')
    expect(root.querySelector('#cal-girtabs')!.innerHTML).toContain('data-key="Girone B"')
  })

  it('selecting a category filters to it and resets girone to Tutti', () => {
    const root = mount()
    ;(root.querySelector('#cal-cattabs [data-key="U12"]') as HTMLButtonElement).click()
    const calbody = root.querySelector('#calbody')!.innerHTML
    expect(calbody).toContain('E <b>vs</b> F')
    expect(calbody).not.toContain('A <b>vs</b> B')
  })

  it('selecting a girone filters within the category', () => {
    const root = mount()
    ;(root.querySelector('#cal-girtabs [data-key="Girone B"]') as HTMLButtonElement).click()
    const calbody = root.querySelector('#calbody')!.innerHTML
    expect(calbody).toContain('C <b>vs</b> D')      // U10 Girone B
    expect(calbody).not.toContain('A <b>vs</b> B')  // U10 Girone A hidden
  })
})

describe('schedule edit teams (S24)', () => {
  const mountWith = (edit = vi.fn().mockResolvedValue({})) => {
    const o7 = { generateSchedule: vi.fn(), approveSchedule: vi.fn(), publishSchedule: vi.fn(), rescheduleMatch: edit, recordResult: vi.fn(), getStandings: vi.fn() }
    const ctx = { client: { o7 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh: vi.fn() }
    const d = data('GENERATED', [match]) // home 'A' away 'B', U10
    const root = document.createElement('div'); root.innerHTML = renderSchedule(d)
    scheduleScreen.mount!(root, ctx as any, d)
    return { root, o7 }
  }
  it('Modifica panel has Casa/Ospite selects; saving sends home/away', async () => {
    const { root, o7 } = mountWith()
    root.querySelector<HTMLButtonElement>('.js-editmatch')!.click()
    ;(root.querySelector('#rs-home') as HTMLSelectElement).value = 'B'
    ;(root.querySelector('#rs-away') as HTMLSelectElement).value = 'A'
    root.querySelector<HTMLButtonElement>('#rs-save')!.click()
    await vi.waitFor(() => expect(o7.rescheduleMatch).toHaveBeenCalled())
    const [, , patch] = o7.rescheduleMatch.mock.calls[0]
    expect(patch).toMatchObject({ home: 'B', away: 'A' })
  })
  it('blocks save when Casa === Ospite (no call)', async () => {
    const { root, o7 } = mountWith()
    root.querySelector<HTMLButtonElement>('.js-editmatch')!.click()
    ;(root.querySelector('#rs-away') as HTMLSelectElement).value = 'A' // == rs-home default 'A'
    root.querySelector<HTMLButtonElement>('#rs-save')!.click()
    await vi.waitFor(() => expect(root.querySelector('#err')!.innerHTML).toContain('squadre diverse'))
    expect(o7.rescheduleMatch).not.toHaveBeenCalled()
  })
})

describe('schedule finals format per category (finals moved to Calendario)', () => {
  it('renders a Fase finale select in the config card, prefilled from config', () => {
    const html = renderSchedule(data('NONE', [], { ...cfg, finalsType: 'SPLIT_GROUP_FINALS', finalsTeamsToBracket: 4 }))
    expect(html).toContain('Fase finale')
    expect(html).toContain('cfg-finalsType')
    expect(html).toContain('cfg-finalsTeamsToBracket')
    expect(html).toMatch(/value="SPLIT_GROUP_FINALS"[^>]*selected/)
  })
  it('per-category cards each carry their own finals select', () => {
    const perCat = { ...cfg, byCategory: {
      U10: { fields: ['A'], periods: 2, periodMinutes: 20, breakMinutes: 10, legs: 'SINGLE' as const, finalsType: 'SINGLE_GROUP_CROSSOVER' as const },
      U12: { fields: ['A'], periods: 2, periodMinutes: 20, breakMinutes: 10, legs: 'SINGLE' as const },
    } }
    const html = renderSchedule(data('NONE', [], perCat))
    // two play cards, each with a finals select
    expect((html.match(/cfg-finalsType/g) ?? []).length).toBe(2)
    expect(html).toMatch(/value="SINGLE_GROUP_CROSSOVER"[^>]*selected/)
  })
})

describe('schedule decree winner on drawn knockout', () => {
  const finalMatch: ScheduledMatchView = { id: 'fm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Tabellone', day: '2026-08-29', time: '14:00', field: 'Campo A', home: '1ª Girone A', away: '2ª Girone A', homeResolved: 'Alfa', awayResolved: 'Bravo', homeScore: 1, awayScore: 1, status: 'FINISHED', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'F', slot: 'F1' }
  const mountWith = (decideWinner = vi.fn().mockResolvedValue({})) => {
    const o7 = { generateSchedule: vi.fn(), approveSchedule: vi.fn(), publishSchedule: vi.fn(), rescheduleMatch: vi.fn(), recordResult: vi.fn().mockResolvedValue({}), decideWinner, startMatch: vi.fn(), finishMatch: vi.fn(), cancelMatch: vi.fn(), getStandings: vi.fn().mockResolvedValue([]) }
    const refresh = vi.fn()
    const ctx = { client: { o7 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const d = data('GENERATED', [finalMatch])
    const root = document.createElement('div'); root.innerHTML = renderSchedule(d)
    scheduleScreen.mount!(root, ctx as any, d)
    return { root, o7, refresh }
  }
  it('shows "chi passa?" on a drawn FINAL and decrees the winner', async () => {
    const { root, o7, refresh } = mountWith()
    root.querySelector<HTMLButtonElement>('.js-resultmatch')!.click()
    expect(root.querySelector('#rr-pass-home')).not.toBeNull()
    expect(root.innerHTML).toContain('chi passa') // case-insensitive-ish label present
    root.querySelector<HTMLButtonElement>('#rr-pass-away')!.click()
    await vi.waitFor(() => expect(o7.decideWinner).toHaveBeenCalledWith('e1', 'fm-1', 'AWAY'))
    expect(refresh).toHaveBeenCalled()
  })
})
