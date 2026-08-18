import type { EventDetail, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderCalendar, esc } from '@playfusion/app-shell'

/** Public, read-only match calendar. Gated on PUBLISHED: until the organizer publishes,
 *  the page shows a "not yet published" notice rather than the fixtures. Categories are
 *  plain strings on the event, so the categoryId is its own display label. */
export function renderPublicCalendar(event: EventDetail, schedule: ScheduleView, matches: ScheduledMatchView[]): string {
  const published = schedule.status === 'PUBLISHED'
  const body = published
    ? renderCalendar(matches, (c) => c)
    : `<p class="pf-muted">Il calendario non è ancora stato pubblicato.</p>`
  const id = encodeURIComponent(event.sportEventId)
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">${esc(event.name ?? event.sport)}</div><h1>Calendario</h1></div>
      <div class="pf-card">${body}</div>
      <div class="pf-row"><a class="pf-btn" href="#/events/${id}">← Torna all'evento</a></div>
    </main>`
}
