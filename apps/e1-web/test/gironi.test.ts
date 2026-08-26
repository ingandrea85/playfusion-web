// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { CategoryGironi, EventDetail, GironiMap } from '@playfusion/rest-client'
import { renderGironi, renderGironiContent, moveTeamAcrossGroups, gironiScreen, type GironiData } from '../src/views/gironi'

const event: EventDetail = {
  sportEventId: 'e1', sport: 'Calcio', categorie: ['U10', 'U12'],
  dates: { from: '2026-08-29', to: '2026-08-30' }, status: 'Published', playbook: 'PB-1', name: 'Torneo',
}
const composed: CategoryGironi = { groups: [{ label: 'Girone A', teams: ['A', 'B'] }, { label: 'Girone B', teams: ['C', 'D'] }], locked: false }
const data = (gironi: GironiMap = {}): GironiData => ({ event, gironi })

describe('moveTeamAcrossGroups', () => {
  it('removes the team from its group and appends it to the target', () => {
    const out = moveTeamAcrossGroups(composed.groups, 'C', 'Girone A')
    expect(out[0]!.teams).toEqual(['A', 'B', 'C'])
    expect(out[1]!.teams).toEqual(['D'])
  })
  it('is a no-op-ish when target equals the current group (team moves to the end)', () => {
    const out = moveTeamAcrossGroups(composed.groups, 'A', 'Girone A')
    expect(out[0]!.teams).toEqual(['B', 'A'])
  })
})

describe('gironi render', () => {
  it('shows the Gironi tab, category tabs, and a draw prompt when empty', () => {
    const html = renderGironi(data())
    expect(html).toContain('/gironi') // Gironi workspace tab href
    expect(html).toContain('data-key="U10"')
    expect(html).toContain('data-key="U12"')
    expect(html).toContain('pf-tabs') // shared sub-tabs, aligned with the rest of the app
    expect(html).toContain('Sorteggia gironi')
    expect(html).toContain('Nessun girone')
  })
  it('renders group columns with move selects when composed', () => {
    const html = renderGironiContent(composed)
    expect(html).toContain('Girone A')
    expect(html).toContain('Girone B')
    expect(html).toContain('js-move')
    expect(html).toContain('>A<')
  })
  it('disables controls when locked', () => {
    const html = renderGironiContent({ ...composed, locked: true })
    expect(html).toMatch(/id="draw"[^>]*disabled/)
    expect(html).toMatch(/id="lock"[^>]*checked/)
    expect(html).toContain('disabled')
  })
})

describe('gironi mount', () => {
  const mountWith = (gironi: GironiMap) => {
    const o3 = {
      drawGironi: vi.fn().mockResolvedValue({ groups: [{ label: 'Girone A', teams: ['A', 'C'] }, { label: 'Girone B', teams: ['B'] }], locked: false }),
      saveGironi: vi.fn().mockImplementation((_id, _c, groups, locked) => Promise.resolve({ groups, locked })),
    }
    const ctx = { client: { o3 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh: () => {} }
    const d = data(gironi)
    const root = document.createElement('div'); root.innerHTML = renderGironi(d)
    gironiScreen.mount!(root, ctx as any, d)
    return { root, o3 }
  }

  it('draw calls o3.drawGironi with the groups count and renders the result', async () => {
    const { root, o3 } = mountWith({})
    ;(root.querySelector('#groupsCount') as HTMLInputElement).value = '2'
    root.querySelector<HTMLButtonElement>('#draw')!.click()
    await vi.waitFor(() => expect(o3.drawGironi).toHaveBeenCalledWith('e1', 'U10', 2))
    await vi.waitFor(() => expect(root.querySelector('#content')!.innerHTML).toContain('js-move'))
  })

  it('moving a team saves the rearranged composition', async () => {
    const { root, o3 } = mountWith({ U10: composed })
    const sel = root.querySelector<HTMLSelectElement>('.js-move')! // team A in Girone A
    sel.value = 'Girone B'
    sel.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(o3.saveGironi).toHaveBeenCalled())
    const [, categoria, groups] = o3.saveGironi.mock.calls[0]
    expect(categoria).toBe('U10')
    expect(groups.find((g: any) => g.label === 'Girone B').teams).toContain('A')
  })

  it('lock toggle saves with locked=true', async () => {
    const { root, o3 } = mountWith({ U10: composed })
    const lock = root.querySelector<HTMLInputElement>('#lock')!
    lock.checked = true
    lock.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(o3.saveGironi).toHaveBeenCalledWith('e1', 'U10', composed.groups, true))
  })
})
