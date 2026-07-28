import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, getAnnouncements, getScheduledMatches, getFinals,
  generateSchedule, approveSchedule, publishSchedule, getSchedule,
  setRegistrationsOpen, rescheduleMatch, recordFinalResult,
} from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

const sys = (eventId: string) => getAnnouncements(eventId).filter(a => a.source === 'SYSTEM')

describe('auto announcements — schedule published', () => {
  it('publishSchedule adds one system announcement, no duplicate', () => {
    const cfg = getSchedule('evt-1')!.config
    generateSchedule('evt-1', cfg); approveSchedule('evt-1'); publishSchedule('evt-1')
    const pub = sys('evt-1').filter(a => a.dedupeKey === 'schedule-published')
    expect(pub).toHaveLength(1)
    expect(pub[0].categoryId).toBeNull()
  })
})

describe('auto announcements — registrations open', () => {
  it('creates the notice on a PB-1 event', () => {
    setRegistrationsOpen('evt-1', false)
    setRegistrationsOpen('evt-1', true)
    expect(sys('evt-1').filter(a => a.dedupeKey === 'registrations-open')).toHaveLength(1)
  })
  it('does not create it on a PB-2 event', () => {
    setRegistrationsOpen('evt-direct', true)
    expect(sys('evt-direct').filter(a => a.dedupeKey === 'registrations-open')).toHaveLength(0)
  })
})

describe('auto announcements — match rescheduled', () => {
  it('one per match; rescheduling the same match replaces it', () => {
    const m = getScheduledMatches('evt-finals')[0]
    rescheduleMatch(m.id, { day: '2026-09-02', time: '10:00', field: 'Campo 2' })
    let n = sys('evt-finals').filter(a => a.dedupeKey === `reschedule:${m.id}`)
    expect(n).toHaveLength(1)
    expect(n[0].body).toContain('10:00')
    rescheduleMatch(m.id, { day: '2026-09-02', time: '15:30', field: 'Campo 3' })
    n = sys('evt-finals').filter(a => a.dedupeKey === `reschedule:${m.id}`)
    expect(n).toHaveLength(1)              // still one
    expect(n[0].body).toContain('15:30')  // updated
    const m2 = getScheduledMatches('evt-finals')[1]
    rescheduleMatch(m2.id, { day: '2026-09-02', time: '11:00', field: 'Campo 2' })
    expect(sys('evt-finals').filter(a => a.dedupeKey?.startsWith('reschedule:'))).toHaveLength(2)
  })
})

describe('auto announcements — champion', () => {
  const finale = () => getFinals('evt-finals').find(f => f.round === 'Finale')!
  const semi = (order: number) => getFinals('evt-finals').find(f => f.round === 'Semifinali' && f.order === order)!
  it('appears when the final is decided and is removed if it becomes undecided', () => {
    recordFinalResult(semi(1).id, 2, 0)
    recordFinalResult(semi(2).id, 1, 0)
    recordFinalResult(finale().id, 3, 1) // decided
    const champ = sys('evt-finals').filter(a => a.dedupeKey?.startsWith('champion:'))
    expect(champ).toHaveLength(1)
    expect(champ[0].body.length).toBeGreaterThan(0)
    recordFinalResult(finale().id, 1, 1) // draw, no shootout → undecided
    expect(sys('evt-finals').filter(a => a.dedupeKey?.startsWith('champion:'))).toHaveLength(0)
  })
})
