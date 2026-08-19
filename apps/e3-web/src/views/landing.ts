import type { EventDetail, RegistrationWindowView } from '@playfusion/rest-client'
import { renderPublicTopbar, esc } from '@playfusion/app-shell'

export { renderParticipants, wireParticipants } from './participants.js'

/** `published` (S7): shows a public "Calendario" link once the schedule is published. */
export function renderLanding(event: EventDetail, window: RegistrationWindowView, published = false): string {
  const id = encodeURIComponent(event.sportEventId)
  // Spectator-facing: categories as chips (no enrollment capacity — organizer info, not for the
  // public). Once the calendar is published each chip links to that category's calendar; before that
  // there's nothing to see, so they're plain chips.
  const cats = event.categorie.map((c) => published
    ? `<a class="pf-tab" href="#/events/${id}/calendar/${encodeURIComponent(c)}">${esc(c)}</a>`
    : `<span class="pf-tab">${esc(c)}</span>`).join('')
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
      <div class="pf-tabs" style="margin:var(--space-sm) 0 var(--space-xl)">${cats}</div>
      <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm)">
        ${calendarCta}
        <a class="pf-btn pf-btn--ghost" href="#/events/${id}/standings">Classifiche →</a>
        ${bracketCta}
        <a class="pf-btn pf-btn--ghost" href="#/events/${id}/participants">Squadre iscritte →</a>
      </div>
      ${enrollHint}
    </div></section>`
}
