// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { entitlements } from '@playfusion/entitlements'
import type { AnnouncementView, EventDetail, RegistrationView } from '@playfusion/rest-client'
import { renderAnnouncements, reachOf, announcementsScreen, type AnnouncementsData } from '../src/views/announcements'

const event: EventDetail = {
  sportEventId: 'e1', sport: 'Calcio', categorie: ['U10', 'U12'],
  dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published', playbook: 'PB-1', name: 'Torneo',
}
const reg = (categoria: string, status: RegistrationView['status'] = 'Confirmed'): RegistrationView =>
  ({ registrationId: `r-${Math.random()}`, participantRef: 'p', sportEventId: 'e1', categoria, status })
const data = (over: Partial<AnnouncementsData> = {}): AnnouncementsData =>
  ({ event, announcements: [], confirmed: [], ...over })

describe('reachOf', () => {
  it('counts all confirmed teams for an event-wide (null) announcement', () => {
    expect(reachOf([reg('U10'), reg('U12'), reg('U10')], null)).toBe(3)
  })
  it('counts only the category for a scoped announcement', () => {
    expect(reachOf([reg('U10'), reg('U12'), reg('U10')], 'U10')).toBe(2)
  })
})

describe('renderAnnouncements', () => {
  it('shows the compose form with a destinatari option per category', () => {
    const html = renderAnnouncements(data())
    expect(html).toContain('Nuovo avviso')
    expect(html).toContain('Tutte le categorie')
    expect(html).toContain('>U10<')
    expect(html).toContain('>U12<')
    expect(html).toContain('id="a-pub"')
  })
  it('shows an empty-state when there are no announcements', () => {
    expect(renderAnnouncements(data())).toContain('Nessun avviso pubblicato')
  })
  it('lists announcements with the pin/delete controls and the pinned chip', () => {
    const anns: AnnouncementView[] = [{ announcementId: 'a1', sportEventId: 'e1', categoryId: 'U10', title: 'Cambio campo', body: 'Campo B', pinned: true, source: 'ORGANIZER', createdAt: 't' }]
    const html = renderAnnouncements(data({ announcements: anns }))
    expect(html).toContain('Cambio campo')
    expect(html).toContain('In evidenza')
    expect(html).toContain('data-pin="a1"')
    expect(html).toContain('data-del="a1"')
  })
})

describe('announcements mount', () => {
  const mountWith = (over: Partial<AnnouncementsData> = {}) => {
    const o9 = {
      publishAnnouncement: vi.fn().mockResolvedValue({}),
      setPin: vi.fn().mockResolvedValue({}),
      deleteAnnouncement: vi.fn().mockResolvedValue(undefined),
    }
    const refresh = vi.fn()
    const ctx = { client: { o9 } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
    const d = data(over)
    const root = document.createElement('div'); root.innerHTML = renderAnnouncements(d)
    announcementsScreen.mount!(root, ctx as any, d)
    return { root, o9, refresh }
  }

  it('reach hint reflects the selected destinatari', () => {
    const { root } = mountWith({ confirmed: [reg('U10'), reg('U12')] })
    expect(root.querySelector('#a-reach')!.textContent).toContain('2 squadre')
    const sel = root.querySelector<HTMLSelectElement>('#a-cat')!
    sel.value = 'U10'; sel.dispatchEvent(new Event('change'))
    expect(root.querySelector('#a-reach')!.textContent).toContain('1 squadre')
  })

  it('publish sends the composed announcement and refreshes', async () => {
    const { root, o9, refresh } = mountWith({})
    ;(root.querySelector('#a-title') as HTMLInputElement).value = 'Cambio campo'
    ;(root.querySelector('#a-body') as HTMLTextAreaElement).value = 'Spostati'
    ;(root.querySelector('#a-cat') as HTMLSelectElement).value = 'U10'
    ;(root.querySelector('#a-pin') as HTMLInputElement).checked = true
    root.querySelector<HTMLButtonElement>('#a-pub')!.click()
    await vi.waitFor(() => expect(o9.publishAnnouncement).toHaveBeenCalledWith('e1', { categoryId: 'U10', title: 'Cambio campo', body: 'Spostati', pinned: true }))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('publish is blocked when title or body is empty', () => {
    const { root, o9 } = mountWith({})
    ;(root.querySelector('#a-title') as HTMLInputElement).value = 'solo titolo'
    root.querySelector<HTMLButtonElement>('#a-pub')!.click()
    expect(o9.publishAnnouncement).not.toHaveBeenCalled()
  })
})

describe('announcementsScreen.load', () => {
  it('tolerates a missing announcements/registrations backend (best-effort)', async () => {
    const ctx = { client: {
      o3: { getEvent: vi.fn().mockResolvedValue(event) },
      o9: { listAnnouncements: vi.fn().mockRejectedValue(new Error('down')) },
      o5: { listRegistrations: vi.fn().mockRejectedValue(new Error('down')) },
    } , entitlements: entitlements('PRO') } as any
    const d = await announcementsScreen.load(ctx, { id: 'e1' })
    expect(d.event.sportEventId).toBe('e1')
    expect(d.announcements).toEqual([])
    expect(d.confirmed).toEqual([])
  })
})
