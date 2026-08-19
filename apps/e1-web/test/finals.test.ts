// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { EventDetail, ScheduledMatchView } from '@playfusion/rest-client'
import { renderFinalsView, finalsScreen } from '../src/views/finals'
import { competitionScreen } from '../src/views/workspace'

const event: EventDetail = { sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published', playbook: 'PB-1', finalsType: 'SINGLE_GROUP_CROSSOVER', qualifiersPerGroup: 2 }
const fin = (over: Partial<ScheduledMatchView>): ScheduledMatchView =>
  ({ id: 'fm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Tabellone', day: '2026-09-02', time: '10:00', field: 'C', home: '1ª Girone A', away: '2ª Girone A', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'Finale', order: 1, ...over })

describe('e1 finals view (S12)', () => {
  it('renders the bracket with placeholders when unresolved', () => {
    const html = renderFinalsView({ event, finals: [fin({})] })
    expect(html).toContain('Finali')
    expect(html).toContain('Tabellone')
    expect(html).toContain('1ª Girone A')
    expect(html).toContain('2ª Girone A')
  })
  it('shows the resolved team when known', () => {
    const html = renderFinalsView({ event, finals: [fin({ homeResolved: 'Alfa', awayResolved: 'Bravo' })] })
    expect(html).toContain('Alfa')
    expect(html).toContain('Bravo')
    expect(html).not.toContain('1ª Girone A')
  })
  it('empty hint when there are no finals', () => {
    expect(renderFinalsView({ event: { ...event, finalsType: undefined }, finals: [] })).toContain('Nessun tabellone')
  })
})

describe('e1 competition finals editor save (S12)', () => {
  it('Salva calls o3.updateFinalsConfig with the chosen type + qualifiers, then refresh', async () => {
    const updateFinalsConfig = vi.fn().mockResolvedValue({})
    const refresh = vi.fn()
    const ctx = { client: { o3: { updateFinalsConfig } } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const root = document.createElement('div')
    root.innerHTML = competitionScreen.render(event)
    competitionScreen.mount!(root, ctx as any, event)
    ;(root.querySelector('#fc-type') as HTMLSelectElement).value = 'PLACEMENT'
    ;(root.querySelector('#fc-q') as HTMLInputElement).value = '4'
    ;(root.querySelector('#fc-save') as HTMLButtonElement).click()
    await Promise.resolve(); await Promise.resolve()
    expect(updateFinalsConfig).toHaveBeenCalledWith('e1', { finalsType: 'PLACEMENT', qualifiersPerGroup: 4 })
    expect(refresh).toHaveBeenCalled()
  })
})
