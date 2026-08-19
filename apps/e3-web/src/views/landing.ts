import type { EventDetail, RegistrationWindowView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderCategoryTag, esc } from '@playfusion/app-shell'

export { renderParticipants, wireParticipants } from './participants.js'

/** `published` (S7): shows a public "Calendario" link once the schedule is published. */
export function renderLanding(event: EventDetail, window: RegistrationWindowView, published = false): string {
  const capOf = (c: string) => window.categories.find((x) => x.categoria === c)
  const cats = event.categorie.map((c) => { const w = capOf(c); return renderCategoryTag(c, w?.count ?? 0, w?.cap ?? 0) }).join('')
  const id = encodeURIComponent(event.sportEventId)
  const bracketCta = published
    ? `<a class="pf-btn pf-btn--ghost" href="#/events/${id}/bracket">Tabellone →</a>`
    : ''
  const calendarCta = published
    ? `<a class="pf-btn" href="#/events/${id}/calendar">Calendario →</a>`
    : ''
  // Public landing is read-only info + navigation. Registration is a SEPARATE page reached
  // only via the enrollment link the organizer sends (option A) — no apply CTA here. A hint
  // tells the public how to register while the window is open.
  const enrollHint = window.state === 'Open'
    ? `<p class="pf-muted" style="margin-top:var(--space-md)">Per iscrivere una squadra usa il link ricevuto dall'organizzatore.</p>`
    : ''
  return `${renderPublicTopbar()}
    <section class="pf-hero"><div class="pf-hero__inner">
      <div class="pf-eyebrow">Evento</div>
      <h1>${esc(event.name ?? event.sport)}</h1>
      <div class="pf-hero__meta">${esc(event.dates.from)} → ${esc(event.dates.to)}</div>
      <div class="pf-eyebrow" style="margin-top:var(--space-lg)">Categorie</div>
      <ul class="pf-catlist" style="margin:var(--space-sm) 0 var(--space-xl)">${cats}</ul>
      <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm)">
        ${calendarCta}
        <a class="pf-btn pf-btn--ghost" href="#/events/${id}/standings">Classifiche →</a>
        ${bracketCta}
        <a class="pf-btn pf-btn--ghost" href="#/events/${id}/participants">Squadre iscritte →</a>
      </div>
      ${enrollHint}
    </div></section>`
}
