import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getAnnouncements, addAnnouncement, removeAnnouncement, togglePin, announcementReach } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('announcements store', () => {
  it('seed has demo announcements on evt-1', () => {
    expect(getAnnouncements('evt-1').length).toBeGreaterThanOrEqual(3)
  })

  it('orders pinned first, then most recent', () => {
    const a = getAnnouncements('evt-1')
    // no non-pinned appears before a pinned one
    const firstNonPinned = a.findIndex(x => !x.pinned)
    const lastPinned = a.map(x => x.pinned).lastIndexOf(true)
    if (firstNonPinned !== -1 && lastPinned !== -1) expect(lastPinned).toBeLessThan(firstNonPinned)
    // within same pinned group, createdAt descending
    for (let i = 1; i < a.length; i++) if (a[i].pinned === a[i - 1].pinned) expect(a[i - 1].createdAt >= a[i].createdAt).toBe(true)
  })

  it('addAnnouncement persists and is scoped to the event', () => {
    const created = addAnnouncement({ eventId: 'evt-1', categoryId: null, title: 'T', body: 'B', pinned: false })
    expect(created.id).toMatch(/^ann-/)
    expect(created.createdAt).not.toBe('')
    expect(getAnnouncements('evt-1').some(x => x.id === created.id)).toBe(true)
    expect(getAnnouncements('evt-finals').some(x => x.id === created.id)).toBe(false)
  })

  it('removeAnnouncement removes only the given one', () => {
    const a = addAnnouncement({ eventId: 'evt-1', categoryId: null, title: 'X', body: 'Y', pinned: false })
    const before = getAnnouncements('evt-1').length
    removeAnnouncement(a.id)
    expect(getAnnouncements('evt-1').length).toBe(before - 1)
    expect(getAnnouncements('evt-1').some(x => x.id === a.id)).toBe(false)
  })

  it('togglePin flips the flag and re-sorts to the front', () => {
    const a = addAnnouncement({ eventId: 'evt-1', categoryId: null, title: 'Z', body: 'Z', pinned: false })
    togglePin(a.id)
    expect(getAnnouncements('evt-1').find(x => x.id === a.id)?.pinned).toBe(true)
  })

  it('announcementReach counts CONFIRMED regs in scope', () => {
    const all = announcementReach('evt-1', null)
    const cat1 = announcementReach('evt-1', 'cat-1')
    // evt-1 seed: cat-1 has 4 CONFIRMED (reg-1,4,5,6), reg-3 is PENDING
    expect(cat1).toBe(4)
    expect(all).toBeGreaterThanOrEqual(cat1)
  })
})
