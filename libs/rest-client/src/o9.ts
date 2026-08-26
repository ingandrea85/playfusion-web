import { request, type HttpConfig } from './http.js'
import type { AnnouncementView, PublishAnnouncementInput } from './types.js'

export interface O9Api {
  listAnnouncements(eventId: string): Promise<AnnouncementView[]>
  publishAnnouncement(eventId: string, input: PublishAnnouncementInput): Promise<AnnouncementView>
  deleteAnnouncement(announcementId: string): Promise<void>
  setPin(announcementId: string, pinned: boolean): Promise<AnnouncementView>
}
export const o9 = (cfg: HttpConfig): O9Api => ({
  listAnnouncements: (id) => request(cfg, 'GET', `/o9/events/${encodeURIComponent(id)}/announcements`),
  publishAnnouncement: (id, input) => request(cfg, 'POST', `/o9/events/${encodeURIComponent(id)}/announcements`, input),
  deleteAnnouncement: (aid) => request(cfg, 'DELETE', `/o9/announcements/${encodeURIComponent(aid)}`),
  setPin: (aid, pinned) => request(cfg, 'POST', `/o9/announcements/${encodeURIComponent(aid)}/pin`, { pinned }),
})
