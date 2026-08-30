// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { SportProfile } from '@playfusion/rest-client'
import { renderCreateEvent, createEventScreen } from '../src/views/create-event'

const sports: SportProfile[] = [
  { id: 's-calcio', name: 'Calcio', participants: 'team', scoreLabel: 'Reti', points: { win: 3, draw: 1, loss: 0 }, tieBreak: ['HEAD_TO_HEAD'], createdAt: 't' },
  { id: 's-tennis', name: 'Tennis', participants: 'both', scoreLabel: 'Set', points: { win: 2, draw: null, loss: 0 }, tieBreak: [], createdAt: 't' },
]

describe('create-event render', () => {
  it('renders playbook, name, a sport selector, format, dates and submit', () => {
    const html = renderCreateEvent([], sports)
    expect(html).toContain('name="playbook"')
    expect(html).toContain('name="sportId"')
    expect(html).toContain('value="s-tennis" data-part="both"')
    expect(html).toContain('name="format"')
    expect(html).toContain('Solo tabellone')
    expect(html).toContain('name="from"')
    expect(html).toContain('name="to"')
    expect(html).not.toContain('data-c="GOAL_DIFFERENCE"') // tie-break editor removed (from the sport now)
  })
})

describe('create-event mount', () => {
  const mountForm = () => {
    const createEvent = vi.fn().mockResolvedValue({ sportEventId: 'new', status: 'Published' })
    const navigate = vi.fn()
    const ctx = { client: { o3: { createEvent } } as any, orgId: 'o', e3BaseUrl: '', navigate, refresh: () => {} }
    const root = document.createElement('div'); root.innerHTML = renderCreateEvent([], sports)
    createEventScreen.mount!(root, ctx as any, { capReached: false, sports })
    return { root, createEvent, navigate }
  }
  const setSport = (root: HTMLElement, id: string) => { const s = root.querySelector('#sportId') as HTMLSelectElement; s.value = id; s.dispatchEvent(new Event('change')) }
  const fillDatesCat = (root: HTMLElement) => {
    ;(root.querySelector('[name=from]') as HTMLInputElement).value = '2026-08-29'
    ;(root.querySelector('[name=to]') as HTMLInputElement).value = '2026-08-30'
    ;(root.querySelector('#cat') as HTMLInputElement).value = 'U10'
    root.querySelector<HTMLButtonElement>('[data-cat-add]')!.click()
  }

  it('submits sportId + format (team sport: no participant field)', async () => {
    const { root, createEvent, navigate } = mountForm()
    setSport(root, 's-calcio')
    expect((root.querySelector('#part-field') as HTMLElement).hidden).toBe(true)
    ;(root.querySelector('[name=name]') as HTMLInputElement).value = 'Torneo'
    fillDatesCat(root)
    ;(root.querySelector('[name=format]') as HTMLSelectElement).value = 'bracket'
    ;(root.querySelector('[name=playbook]') as HTMLSelectElement).value = 'PB-2'
    root.querySelector<HTMLFormElement>('#form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await vi.waitFor(() => expect(createEvent).toHaveBeenCalled())
    const input = createEvent.mock.calls[0][0]
    expect(input).toMatchObject({ sportId: 's-calcio', name: 'Torneo', format: 'bracket', categorie: ['U10'], playbook: 'PB-2', dates: { from: '2026-08-29', to: '2026-08-30' } })
    expect(input.participantType).toBeUndefined() // team-only sport
    expect(navigate).toHaveBeenCalledWith('#/events/new')
  })

  it('shows the participant choice for a both-sport and submits it', async () => {
    const { root, createEvent } = mountForm()
    setSport(root, 's-tennis')
    expect((root.querySelector('#part-field') as HTMLElement).hidden).toBe(false)
    ;(root.querySelector('input[name="participantType"][value="individual"]') as HTMLInputElement).checked = true
    fillDatesCat(root)
    root.querySelector<HTMLFormElement>('#form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await vi.waitFor(() => expect(createEvent).toHaveBeenCalled())
    expect(createEvent.mock.calls[0][0]).toMatchObject({ sportId: 's-tennis', participantType: 'individual' })
  })
})
