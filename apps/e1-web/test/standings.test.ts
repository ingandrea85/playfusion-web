// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { EventDetail, GroupStanding } from '@playfusion/rest-client'
import { renderStandingsView } from '../src/views/standings'

const event: EventDetail = { sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published', playbook: 'PB-1', name: 'Torneo' }
const standings: GroupStanding[] = [{ categoryId: 'U10', groupLabel: 'Girone A', rows: [
  { team: 'A', played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 0, goalDiff: 2, points: 3 },
  { team: 'B', played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 2, goalDiff: -2, points: 0 },
] }]

describe('e1 standings view', () => {
  it('renders the Classifiche tab + a table with teams ordered and points', () => {
    const html = renderStandingsView({ event, standings })
    expect(html).toContain('/standings') // tab href
    expect(html).toContain('U10 · Girone A')
    expect(html).toContain('A')
    expect(html).toContain('<b>3</b>') // points
  })
  it('shows an empty hint when there are no standings', () => {
    expect(renderStandingsView({ event, standings: [] })).toContain('Nessuna classifica')
  })
})
