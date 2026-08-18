import type { EventDetail, RegistrationWindowView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderCategoryTag, esc } from '@playfusion/app-shell'

export { renderParticipants } from './participants.js'

export function renderLanding(event: EventDetail, window: RegistrationWindowView): string {
  const capOf = (c: string) => window.categories.find((x) => x.categoria === c)
  const cats = event.categorie.map((c) => { const w = capOf(c); return renderCategoryTag(c, w?.count ?? 0, w?.cap ?? 0) }).join('')
  const id = encodeURIComponent(event.sportEventId)
  // The apply CTA only exists while the window is Open; a closed window renders no
  // /apply link, so coaches can't land on a form the backend would reject.
  const applyCta = window.state === 'Open'
    ? `<a class="pf-btn pf-btn--primary" href="#/events/${id}/apply">Iscrivi la tua squadra →</a>`
    : ''
  return `${renderPublicTopbar()}
    <section class="pf-hero"><div class="pf-hero__inner">
      <div class="pf-eyebrow">Evento</div>
      <h1>${esc(event.sport)}</h1>
      <div class="pf-hero__meta">${esc(event.dates.from)} → ${esc(event.dates.to)}</div>
      <ul class="pf-catlist">${cats}</ul>
      <div class="pf-row">${applyCta}<a class="pf-btn" href="#/events/${id}/participants">Vedi le squadre iscritte →</a></div>
    </div></section>`
}
