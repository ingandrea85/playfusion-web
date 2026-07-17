import { describe, expect, it } from 'vitest'
import { buildFinals } from './finals'

describe('buildFinals', () => {
  it('SINGLE_GROUP_CROSSOVER with 4 qualifiers → SF (1v4, 2v3) + Finale', () => {
    const d = buildFinals(['Girone A'], 4, 'SINGLE_GROUP_CROSSOVER')
    expect(d).toEqual([
      { bracketLabel: 'Tabellone', round: 'Semifinali', order: 1, home: '1ª Girone A', away: '4ª Girone A' },
      { bracketLabel: 'Tabellone', round: 'Semifinali', order: 2, home: '2ª Girone A', away: '3ª Girone A' },
      { bracketLabel: 'Tabellone', round: 'Finale', order: 1, home: 'Vincente SF1', away: 'Vincente SF2' },
    ])
  })

  it('SINGLE_GROUP_CROSSOVER with 2 qualifiers → just a Finale', () => {
    const d = buildFinals(['Girone A'], 2, 'SINGLE_GROUP_CROSSOVER')
    expect(d).toEqual([{ bracketLabel: 'Tabellone', round: 'Finale', order: 1, home: '1ª Girone A', away: '2ª Girone A' }])
  })

  it('SPLIT_GROUP_FINALS with 2 groups, Q2 → oro + argento finals', () => {
    const d = buildFinals(['Girone A', 'Girone B'], 2, 'SPLIT_GROUP_FINALS')
    expect(d).toEqual([
      { bracketLabel: 'Tabellone Oro', round: 'Finale', order: 1, home: '1ª Girone A', away: '1ª Girone B' },
      { bracketLabel: 'Tabellone Argento', round: 'Finale', order: 1, home: '2ª Girone A', away: '2ª Girone B' },
    ])
  })

  it('PLACEMENT with 2 groups, Q2 → placement finals by position', () => {
    const d = buildFinals(['Girone A', 'Girone B'], 2, 'PLACEMENT')
    expect(d).toEqual([
      { bracketLabel: 'Piazzamento', round: 'Finale 1º/2º', order: 1, home: '1ª Girone A', away: '1ª Girone B' },
      { bracketLabel: 'Piazzamento', round: 'Finale 3º/4º', order: 2, home: '2ª Girone A', away: '2ª Girone B' },
    ])
  })
})
