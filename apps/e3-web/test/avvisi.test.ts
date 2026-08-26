// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { AnnouncementView, EventDetail } from '@playfusion/rest-client'
import { renderPublicAvvisi, wirePublicAvvisi, filterAnnouncements } from '../src/views/avvisi'

const event: EventDetail = {
  sportEventId: 'e1', sport: 'Calcio', categorie: ['U10', 'U12'],
  dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published', playbook: 'PB-1', name: 'Torneo',
}
const a = (announcementId: string, categoryId: string | null): AnnouncementView =>
  ({ announcementId, sportEventId: 'e1', categoryId, title: announcementId, body: 'b', pinned: false, source: 'ORGANIZER', createdAt: 't' })
const anns = [a('wide', null), a('u10', 'U10'), a('u12', 'U12')]

describe('filterAnnouncements', () => {
  it('ALL shows everything', () => {
    expect(filterAnnouncements(anns, 'ALL').map((x) => x.announcementId)).toEqual(['wide', 'u10', 'u12'])
  })
  it('a category shows event-wide + that category only', () => {
    expect(filterAnnouncements(anns, 'U10').map((x) => x.announcementId)).toEqual(['wide', 'u10'])
  })
})

describe('renderPublicAvvisi', () => {
  it('renders the public topbar, category tabs and the cards', () => {
    const html = renderPublicAvvisi(event, anns)
    expect(html).toContain('Avvisi')
    expect(html).toContain('data-key="U10"')
    expect(html).toContain('data-key="U12"')
    expect(html).toContain('id="av-list"')
  })
  it('shows an empty-state when there are no announcements', () => {
    expect(renderPublicAvvisi(event, [])).toContain('Nessun avviso pubblicato')
  })
})

describe('wirePublicAvvisi', () => {
  it('filters the list when a category tab is clicked', () => {
    const root = document.createElement('div'); root.innerHTML = renderPublicAvvisi(event, anns)
    wirePublicAvvisi(root, event, anns)
    ;(root.querySelector('#av-tabs [data-key="U12"]') as HTMLButtonElement).click()
    const list = root.querySelector('#av-list')!.innerHTML
    expect(list).toContain('>u12<') // u12 title present
    expect(list).toContain('>wide<') // event-wide always shown
    expect(list).not.toContain('>u10<')
  })
})
