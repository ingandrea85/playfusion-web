import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getEvents, getStandings, getFinals, getScheduledMatches, getTieOverrides, setTieOverride } from './store'
import { rankStanding } from './ranking'
import { defaultTieBreak } from './tiebreak'

const rankOf = (eventId: string) => {
  const rows = getStandings(eventId)
  const matches = getScheduledMatches(eventId)
  return rankStanding(rows, matches, defaultTieBreak('Calcio'))
}

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('tie-break demo events', () => {
  it('seeds the five demo events alongside evt-1', () => {
    const ids = getEvents().map(e => e.id)
    expect(ids).toContain('evt-tie-h2h')
    expect(ids).toContain('evt-tie-avulsa')
    expect(ids).toContain('evt-tie-dr')
    expect(ids).toContain('evt-tie-gf')
    expect(ids).toContain('evt-tie-open')
  })

  it('head-to-head event ranks the direct-match winner first', () => {
    const res = rankOf('evt-tie-h2h')
    expect(res.rows.slice(0, 2).map(r => r.team)).toEqual(['Alfa', 'Bravo'])
    expect(res.unresolved).toEqual([])
  })

  it('avulsa event ranks by the mini-league among the three tied teams', () => {
    expect(rankOf('evt-tie-avulsa').rows.map(r => r.team)).toEqual(['Alfa', 'Charlie', 'Bravo', 'Delta'])
  })

  it('goal-difference event separates two drawn teams by overall GD', () => {
    expect(rankOf('evt-tie-dr').rows.slice(0, 2).map(r => r.team)).toEqual(['Alfa', 'Bravo'])
  })

  it('goals-for event separates two drawn, equal-GD teams by goals scored', () => {
    expect(rankOf('evt-tie-gf').rows.slice(0, 2).map(r => r.team)).toEqual(['Alfa', 'Bravo'])
  })

  it('unresolved event reports the tied pair and leaves both final slots as placeholders', () => {
    const res = rankOf('evt-tie-open')
    expect(res.unresolved).toEqual([['Alfa', 'Bravo']])
    const finals = getFinals('evt-tie-open')
    expect(finals).toHaveLength(1)
    expect(finals[0].homeResolved).toBeNull()
    expect(finals[0].awayResolved).toBeNull()
  })

  it('a resolved event fills its final slots from the standings', () => {
    const f = getFinals('evt-tie-h2h')[0]
    expect(f.homeResolved).toBe('Alfa')
    expect(f.awayResolved).toBe('Bravo')
  })

  it('a manual override resolves the open event finals slots in the chosen order', () => {
    const cat = 'evt-tie-open-cat'
    setTieOverride('evt-tie-open', cat, 'Girone A', ['Bravo', 'Alfa'])
    const f = getFinals('evt-tie-open')[0]
    expect(f.homeResolved).toBe('Bravo') // 1ª Girone A
    expect(f.awayResolved).toBe('Alfa')  // 2ª Girone A
    expect(getTieOverrides('evt-tie-open')).toHaveLength(1)
  })

  it('a non-matching override is ignored (slots stay placeholders)', () => {
    const cat = 'evt-tie-open-cat'
    setTieOverride('evt-tie-open', cat, 'Girone A', ['Alfa', 'Charlie']) // wrong set
    const f = getFinals('evt-tie-open')[0]
    expect(f.homeResolved).toBeNull()
    expect(f.awayResolved).toBeNull()
  })
})
