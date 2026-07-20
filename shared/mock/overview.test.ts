import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, getSchedule, getFinals,
  generateSchedule, approveSchedule, publishSchedule, recordFinalResult,
  getEventPhase, getPendingActions, getNextMatches, getLastResults, getGroupLeaders,
} from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

function publishEvt1() {
  generateSchedule('evt-1', getSchedule('evt-1')!.config); approveSchedule('evt-1'); publishSchedule('evt-1')
}

describe('eventPhase', () => {
  it('PREP when schedule not published', () => {
    expect(getEventPhase('evt-1')).toBe('PREP')
  })
  it('LIVE when published with finals unplayed', () => {
    expect(getEventPhase('evt-finals')).toBe('LIVE') // demo: groups played, finals not
  })
  it('DONE once every group and finals match has a score', () => {
    const semis = getFinals('evt-finals').filter(f => f.round === 'Semifinali')
    recordFinalResult(semis[0].id, 2, 0); recordFinalResult(semis[1].id, 1, 0)
    for (const f of getFinals('evt-finals').filter(f => f.homeScore === null)) recordFinalResult(f.id, 1, 0)
    expect(getEventPhase('evt-finals')).toBe('DONE')
  })
})

describe('pendingActions', () => {
  it('flags not-published and missing results after publish', () => {
    expect(getPendingActions('evt-1').notPublished).toBe(true)
    publishEvt1()
    const p = getPendingActions('evt-1')
    expect(p.notPublished).toBe(false)
    expect(p.missingResults).toBeGreaterThan(0) // fresh calendar, nothing played
  })
  it('counts unresolved ties', () => {
    expect(getPendingActions('evt-tie-open').unresolvedTies).toBeGreaterThanOrEqual(1)
  })
  it('counts confirmed-unpaid registrations', () => {
    // evt-1 seed: reg-2 and reg-6 are CONFIRMED + UNPAID
    expect(getPendingActions('evt-1').unpaid).toBe(2)
  })
})

describe('nextMatches / lastResults', () => {
  it('nextMatches returns unplayed sorted by day/time', () => {
    publishEvt1()
    const nm = getNextMatches('evt-1', 3)
    expect(nm.length).toBeGreaterThan(0)
    expect(nm.every(m => m.homeScore === null)).toBe(true)
    for (let i = 1; i < nm.length; i++) expect(`${nm[i - 1].day}${nm[i - 1].time}` <= `${nm[i].day}${nm[i].time}`).toBe(true)
  })
  it('lastResults returns played sorted most-recent first', () => {
    const lr = getLastResults('evt-finals', 3)
    expect(lr.length).toBeGreaterThan(0)
    expect(lr.every(m => m.homeScore !== null)).toBe(true)
  })
})

describe('groupLeaders', () => {
  it('returns one leader per group', () => {
    const leaders = getGroupLeaders('evt-finals')
    expect(leaders.length).toBeGreaterThan(0)
    expect(leaders[0].team.length).toBeGreaterThan(0)
  })
})
