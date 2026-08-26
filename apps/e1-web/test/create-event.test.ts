// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderCreateEvent, createEventScreen } from '../src/views/create-event'

describe('create-event render', () => {
  it('renders playbook, name, location, sport, date+time and a submit', () => {
    const html = renderCreateEvent()
    expect(html).toContain('name="playbook"')
    expect(html).toContain('value="PB-1"')
    expect(html).toContain('value="PB-2"')
    expect(html).toContain('name="name"')
    expect(html).toContain('name="location"')
    expect(html).toContain('name="sport"')
    expect(html).toContain('data-cat-add') // add-category control
    expect(html).toContain('name="from"')
    expect(html).toContain('name="startTime"')
    expect(html).toContain('name="to"')
    expect(html).toMatch(/type="submit"|js-create/)
  })

  it('renders the tie-break editor with a fixed points row and toggleable criteria', () => {
    const html = renderCreateEvent()
    expect(html).toMatch(/Punti/) // fixed first row
    expect(html).toContain('Differenza reti')
    expect(html).toContain('data-c="GOAL_DIFFERENCE"')
  })
})

describe('create-event mount', () => {
  const mountForm = () => {
    const createEvent = vi.fn().mockResolvedValue({ sportEventId: 'new', status: 'Published' })
    const navigate = vi.fn()
    const ctx = { client: { o3: { createEvent } } as any, orgId: 'o', e3BaseUrl: '', navigate, refresh: () => {} }
    const root = document.createElement('div'); root.innerHTML = renderCreateEvent()
    createEventScreen.mount!(root, ctx as any, { capReached: false })
    return { root, createEvent, navigate }
  }

  const setSport = (root: HTMLElement, v: string) => {
    const s = root.querySelector('[name=sport]') as HTMLInputElement
    s.value = v; s.dispatchEvent(new Event('change'))
  }

  it('submits the full competition config including playbook and tie-break', async () => {
    const { root, createEvent, navigate } = mountForm()
    ;(root.querySelector('[name=name]') as HTMLInputElement).value = 'Torneo Estivo'
    setSport(root, 'Calcio')
    ;(root.querySelector('[name=location]') as HTMLInputElement).value = 'Rivalta'
    ;(root.querySelector('[name=from]') as HTMLInputElement).value = '2026-08-29'
    ;(root.querySelector('[name=startTime]') as HTMLInputElement).value = '09:00'
    ;(root.querySelector('[name=to]') as HTMLInputElement).value = '2026-08-30'
    ;(root.querySelector('#cat') as HTMLInputElement).value = 'U10'
    root.querySelector<HTMLButtonElement>('[data-cat-add]')!.click()
    ;(root.querySelector('[name=playbook]') as HTMLSelectElement).value = 'PB-2'
    root.querySelector<HTMLFormElement>('#form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await vi.waitFor(() => expect(createEvent).toHaveBeenCalled())
    const input = createEvent.mock.calls[0][0]
    expect(input).toMatchObject({
      name: 'Torneo Estivo', sport: 'Calcio', location: 'Rivalta',
      dates: { from: '2026-08-29', to: '2026-08-30' }, startTime: '09:00',
      categorie: ['U10'], playbook: 'PB-2',
    })
    expect(input.tieBreak).toEqual(['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']) // Calcio default
    expect(navigate).toHaveBeenCalledWith('#/events/new')
  })

  it('deactivating a criterion drops it from the submitted policy', async () => {
    const { root, createEvent } = mountForm()
    setSport(root, 'Calcio')
    ;(root.querySelector('[name=from]') as HTMLInputElement).value = '2026-08-29'
    ;(root.querySelector('[name=to]') as HTMLInputElement).value = '2026-08-30'
    ;(root.querySelector('#cat') as HTMLInputElement).value = 'U10'
    root.querySelector<HTMLButtonElement>('[data-cat-add]')!.click()
    const cb = root.querySelector<HTMLInputElement>('input[data-c="GOALS_FOR"]')!
    cb.checked = false; cb.dispatchEvent(new Event('change'))
    root.querySelector<HTMLFormElement>('#form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await vi.waitFor(() => expect(createEvent).toHaveBeenCalled())
    expect(createEvent.mock.calls[0][0].tieBreak).toEqual(['HEAD_TO_HEAD', 'GOAL_DIFFERENCE'])
  })
})
