// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { EventDetail, ScheduledMatchView } from '@playfusion/rest-client'
import { renderFinalsView, finalsScreen } from '../src/views/finals'
import { renderWorkspace } from '../src/views/workspace'

const event: EventDetail = { sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published', playbook: 'PB-1' }
const fin = (over: Partial<ScheduledMatchView>): ScheduledMatchView =>
  ({ id: 'fm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Tabellone', day: '2026-09-02', time: '10:00', field: 'C', home: '1ª Girone A', away: '2ª Girone A', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'Finale', order: 1, ...over })

describe('e1 finals view (S12)', () => {
  it('renders the bracket with placeholders when unresolved', () => {
    const html = renderFinalsView({ ranking: [], event, finals: [fin({})] })
    expect(html).toContain('Finali')
    expect(html).toContain('Tabellone')
    expect(html).toContain('1ª Girone A')
    expect(html).toContain('2ª Girone A')
  })
  it('shows the resolved team when known', () => {
    const html = renderFinalsView({ ranking: [], event, finals: [fin({ homeResolved: 'Alfa', awayResolved: 'Bravo' })] })
    expect(html).toContain('Alfa')
    expect(html).toContain('Bravo')
    expect(html).not.toContain('1ª Girone A')
  })
  it('empty hint when there are no finals', () => {
    expect(renderFinalsView({ ranking: [], event, finals: [] })).toContain('Nessun tabellone')
  })
})

describe('e1 has no event-level finals editor (S13, moved to Calendario)', () => {
  it('Panoramica renders no finals editor', () => {
    expect(renderWorkspace(event, 'overview')).not.toContain('id="fc-type"')
  })
})

describe('e1 finals FINAL_GROUP + round labels (S13)', () => {
  it('renders the girone finale section and maps round codes to labels', () => {
    const finals: ScheduledMatchView[] = [
      fin({ id: 'sf1', slot: 'T1-SF1', round: 'SF', bracketLabel: 'Tabellone', home: '1ª Girone A', away: '4ª Girone A', homeResolved: 'Alfa', awayResolved: 'Delta' }),
      fin({ id: 'fg1', slot: 'FG1', round: 'Girone finale', bracketLabel: 'Girone finale', phase: 'FINAL_GROUP', home: '3ª Girone A', away: '4ª Girone A', homeResolved: 'Charlie', awayResolved: 'Delta' }),
    ]
    const html = renderFinalsView({ ranking: [], event, finals })
    expect(html).toContain('Semifinali') // SF code mapped
    expect(html).toContain('Girone finale')
    expect(html).toContain('Charlie')
    expect(html).toContain('Alfa')
  })
})

describe('e1 finals view final ranking (S13)', () => {
  it('renders the Classifica finale with decided + "da definire" positions', () => {
    const finals = [fin({ id: 'f1', slot: 'F1', bracketLabel: 'Tabellone', round: 'F', homeResolved: 'Alfa', awayResolved: 'Bravo' })]
    const ranking = [{ categoryId: 'U10', rows: [{ position: 1, team: 'Alfa' }, { position: 2, team: 'Bravo' }, { position: 3, pending: 'tie' as const }] }]
    const html = renderFinalsView({ event, finals, ranking })
    expect(html).toContain('Classifica finale')
    expect(html).toContain('1º')
    expect(html).toContain('Alfa')
    expect(html).toContain('da definire')
  })
})
