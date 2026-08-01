import type { EventDetail, RegistrationWindowView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderCategoryTag } from '@playfusion/app-shell'

export { renderParticipants } from './participants.js'

export function renderLanding(event: EventDetail, window: RegistrationWindowView): string {
  const capOf = (c: string) => window.categories.find((x) => x.categoria === c)
  const cats = event.categorie.map((c) => { const w = capOf(c); return renderCategoryTag(c, w?.count ?? 0, w?.cap ?? 0) }).join('')
  return `${renderPublicTopbar()}
    <section class="pf-hero"><div class="pf-hero__inner">
      <div class="pf-eyebrow">Evento</div>
      <h1>${event.sport}</h1>
      <div class="pf-hero__meta">${event.dates.from} → ${event.dates.to}</div>
      <ul class="pf-catlist">${cats}</ul>
      <div><a class="pf-btn" href="#/events/${event.sportEventId}/participants">Vedi le squadre iscritte →</a></div>
    </div></section>`
}
