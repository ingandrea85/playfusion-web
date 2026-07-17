import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getFinals } from './store'

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
})
