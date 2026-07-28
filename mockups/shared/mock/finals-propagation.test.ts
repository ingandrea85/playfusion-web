import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getFinals, recordFinalResult } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('finals bracket — demo fixture', () => {
  it('evt-finals seeds two semifinals and a final', () => {
    const f = getFinals('evt-finals')
    expect(f.filter(x => x.round === 'Semifinali')).toHaveLength(2)
    expect(f.filter(x => x.round === 'Finale')).toHaveLength(1)
  })

  it('the semifinals have resolved participants (group complete), the final does not yet', () => {
    const f = getFinals('evt-finals')
    const semis = f.filter(x => x.round === 'Semifinali')
    for (const s of semis) { expect(s.homeResolved).not.toBeNull(); expect(s.awayResolved).not.toBeNull() }
    const finale = f.find(x => x.round === 'Finale')!
    expect(finale.homeResolved).toBeNull() // "Vincente SF1" — no result yet
    expect(finale.awayResolved).toBeNull()
  })

  it('finals matches start with null scores', () => {
    for (const f of getFinals('evt-finals')) { expect(f.homeScore).toBeNull(); expect(f.awayScore).toBeNull() }
  })

  it('existing single-final demos are unchanged (evt-tie-open still 1ª vs 2ª)', () => {
    const f = getFinals('evt-tie-open')
    expect(f).toHaveLength(1)
    expect(f[0].home).toBe('1ª Girone A')
    expect(f[0].away).toBe('2ª Girone A')
  })

  it('evt-finals includes a Finale 3º/4º (thirdPlace on)', () => {
    const f = getFinals('evt-finals')
    const tp = f.find(x => x.round === 'Finale 3º/4º')
    expect(tp).toBeDefined()
    expect(tp!.home).toBe('Perdente SF1')
    expect(tp!.away).toBe('Perdente SF2')
    expect(tp!.homeShootout).toBeNull()
  })
})

describe('finals bracket — winner propagation', () => {
  const finale = () => getFinals('evt-finals').find(f => f.round === 'Finale')!
  const semi = (order: number) => getFinals('evt-finals').find(f => f.round === 'Semifinali' && f.order === order)!

  it('propagates semifinal winners into the final', () => {
    recordFinalResult(semi(1).id, 2, 0) // SF1 home wins
    recordFinalResult(semi(2).id, 1, 0) // SF2 home wins
    expect(finale().homeResolved).toBe(semi(1).homeResolved) // Vincente SF1
    expect(finale().awayResolved).toBe(semi(2).homeResolved) // Vincente SF2
  })

  it('a drawn knockout match propagates no winner', () => {
    recordFinalResult(semi(1).id, 1, 1) // draw
    expect(finale().homeResolved).toBeNull()
  })

  it('correcting a result re-propagates', () => {
    recordFinalResult(semi(1).id, 2, 0) // home wins
    recordFinalResult(semi(2).id, 1, 0)
    expect(finale().homeResolved).toBe(semi(1).homeResolved)
    recordFinalResult(semi(1).id, 0, 2) // now away wins
    expect(finale().homeResolved).toBe(semi(1).awayResolved)
  })

  it('the final winner is determined once the final is played', () => {
    recordFinalResult(semi(1).id, 2, 0) // SF1 → Alfa
    recordFinalResult(semi(2).id, 1, 0) // SF2 → Bravo
    const f = finale()
    expect(f.homeResolved).toBe(semi(1).homeResolved) // Vincente SF1 (Alfa)
    recordFinalResult(f.id, 3, 1)                     // home wins the final
    const played = getFinals('evt-finals').find(x => x.round === 'Finale')!
    // champion = higher-scored resolved participant = Vincente SF1's team
    const champion = played.homeScore! > played.awayScore! ? played.homeResolved : played.awayResolved
    expect(champion).toBe(semi(1).homeResolved)
  })

  it('a drawn semifinal is decided by the shootout and propagates the winner', () => {
    recordFinalResult(semi(1).id, 1, 1, { home: 5, away: 4 }) // draw, home wins on penalties
    recordFinalResult(semi(2).id, 2, 0)
    expect(finale().homeResolved).toBe(semi(1).homeResolved) // shootout winner advances
  })

  it('propagates the loser into the Finale 3º/4º', () => {
    recordFinalResult(semi(1).id, 2, 0) // home wins SF1 → away is loser
    recordFinalResult(semi(2).id, 0, 1) // away wins SF2 → home is loser
    const tp = getFinals('evt-finals').find(f => f.round === 'Finale 3º/4º')!
    expect(tp.homeResolved).toBe(semi(1).awayResolved) // Perdente SF1
    expect(tp.awayResolved).toBe(semi(2).homeResolved) // Perdente SF2
  })

  it('a shootout is ignored when regular time is not a draw', () => {
    recordFinalResult(semi(1).id, 2, 1, { home: 1, away: 9 }) // home won in regular time
    expect(semi(1).homeShootout).toBeNull()
    expect(finale().homeResolved).toBe(semi(1).homeResolved) // regular-time winner, not the shootout
  })

  it('correcting a semifinal back to undecided clears the already-propagated downstream slot', () => {
    recordFinalResult(semi(1).id, 2, 0)
    recordFinalResult(semi(2).id, 1, 0)
    expect(finale().homeResolved).not.toBeNull() // populated
    recordFinalResult(semi(1).id, 1, 1) // draw, no shootout → SF1 undecided again
    expect(finale().homeResolved).toBeNull() // Vincente SF1 reverts
    const tp = getFinals('evt-finals').find(f => f.round === 'Finale 3º/4º')!
    expect(tp.homeResolved).toBeNull() // Perdente SF1 reverts too
  })
})
