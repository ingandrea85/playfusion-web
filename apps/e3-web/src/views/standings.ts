import type { EventDetail, GroupStanding } from '@playfusion/rest-client'
import { renderPublicTopbar, renderStandings, esc } from '@playfusion/app-shell'

/** Public, read-only standings (S10) — the same tables the organizer sees, without editing. */
export function renderPublicStandings(event: EventDetail, standings: GroupStanding[]): string {
  const id = encodeURIComponent(event.sportEventId)
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">${esc(event.name ?? event.sport)}</div><h1>Classifiche</h1></div>
      <div class="pf-card">${renderStandings(standings, (c) => c)}</div>
      <div class="pf-row"><a class="pf-btn" href="#/events/${id}">← Torna all'evento</a></div>
    </main>`
}
