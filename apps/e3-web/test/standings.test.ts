import { describe, it, expect } from 'vitest'
import type { EventDetail, GroupStanding, RegistrationWindowView } from '@playfusion/rest-client'
import { renderPublicStandings } from '../src/views/standings'
import { renderLanding } from '../src/views/landing'

const event: EventDetail = { sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published', playbook: 'PB-1', name: 'Torneo' }
const standings: GroupStanding[] = [{ categoryId: 'U10', groupLabel: 'Girone A', rows: [
  { team: 'A', played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 0, goalDiff: 2, points: 3 },
] }]
const win: RegistrationWindowView = { sportEventId: 'e1', state: 'Open', categories: [] }

describe('e3 public standings', () => {
  it('renders read-only standings tables', () => {
    const html = renderPublicStandings(event, standings)
    expect(html).toContain('U10 · Girone A')
    expect(html).toContain('<b>3</b>')
    expect(html).not.toContain('js-') // no edit controls
  })
  it('shows the empty hint when there are no standings', () => {
    expect(renderPublicStandings(event, [])).toContain('Nessuna classifica')
  })
  it('landing links to the public standings', () => {
    expect(renderLanding(event, win)).toContain('/events/e1/standings')
  })
})
