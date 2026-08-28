import type { EventDetail, RegistrationWindowView, ResolvedEventSite } from '@playfusion/rest-client'
import { hasSiteContent } from '@playfusion/rest-client'
import { renderPublicTopbar, esc } from '@playfusion/app-shell'

export { renderParticipants, wireParticipants } from './participants.js'

const catChips = (event: EventDetail, published: boolean): string => {
  const id = encodeURIComponent(event.sportEventId)
  return event.categorie.map((c) => published
    ? `<a class="pf-tab" href="#/events/${id}/calendar/${encodeURIComponent(c)}">${esc(c)}</a>`
    : `<span class="pf-tab">${esc(c)}</span>`).join('')
}

/** The results/nav buttons (Calendario / Classifiche / Tabellone / Avvisi / Squadre). */
function navButtons(event: EventDetail, published: boolean): string {
  const id = encodeURIComponent(event.sportEventId)
  const calendarCta = published ? `<a class="pf-btn" href="#/events/${id}/calendar">Calendario →</a>` : ''
  const bracketCta = published ? `<a class="pf-btn pf-btn--ghost" href="#/events/${id}/bracket">Tabellone →</a>` : ''
  return `${calendarCta}
    <a class="pf-btn pf-btn--ghost" href="#/events/${id}/standings">Classifiche →</a>
    ${bracketCta}
    <a class="pf-btn pf-btn--ghost" href="#/events/${id}/avvisi">Avvisi →</a>
    <a class="pf-btn pf-btn--ghost" href="#/events/${id}/participants">Squadre iscritte →</a>`
}

/** Basic landing (unchanged): hero + category chips + nav buttons + enrollment hint. Used when the
 *  organizer hasn't authored an event site (or is on the Free plan). */
function renderBasicLanding(event: EventDetail, window: RegistrationWindowView, published: boolean): string {
  const enrollHint = window.state === 'Open'
    ? `<p class="pf-muted" style="margin-top:var(--space-md)">Per iscrivere una squadra usa il link ricevuto dall'organizzatore.</p>`
    : ''
  return `${renderPublicTopbar()}
    <section class="pf-hero"><div class="pf-hero__inner">
      <div class="pf-eyebrow">Evento</div>
      <h1>${esc(event.name ?? event.sport)}</h1>
      <div class="pf-hero__meta">${esc(event.dates.from)} → ${esc(event.dates.to)}</div>
      <div class="pf-eyebrow" style="margin-top:var(--space-lg)">Categorie</div>
      <div class="pf-tabs" style="margin:var(--space-sm) 0 var(--space-xl)">${catChips(event, published)}</div>
      <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm)">${navButtons(event, published)}</div>
      ${enrollHint}
    </div></section>`
}

const section = (title: string, body: string): string =>
  body ? `<section class="pf-esite-sec"><div class="pf-container"><div class="pf-eyebrow">${esc(title)}</div>${body}</div></section>` : ''

/** Rich event home from the resolved site (Pro). */
function renderEventHome(event: EventDetail, window: RegistrationWindowView, published: boolean, site: ResolvedEventSite): string {
  const id = encodeURIComponent(event.sportEventId)
  const venue = site.venue
  const venueName = venue?.name || venue?.address
  const meta = [
    `${esc(event.dates.from)} → ${esc(event.dates.to)}`,
    venueName ? `📍 ${esc(venue?.name || venue?.address || '')}` : '',
  ].filter(Boolean).join(' · ')

  const about = site.about ? `<p class="pf-esite-lead">${esc(site.about)}</p>` : ''
  const program = site.program ? `<p class="pf-esite-pre">${esc(site.program)}</p>` : ''
  const venueBlock = venue && (venue.name || venue.address) ? `
    <p style="margin:2px 0 var(--space-md)">${esc([venue.name, venue.address].filter(Boolean).join(' — '))}</p>
    ${venue.mapUrl ? `<a class="pf-btn" href="${esc(venue.mapUrl)}" target="_blank" rel="noopener">📍 Apri in Maps →</a>` : ''}` : ''
  const sponsorInner = (s: { name: string; tier?: string; logoUrl?: string }): string =>
    (s.logoUrl ? `<img class="pf-esite-sponsor__logo" src="${esc(s.logoUrl)}" alt="${esc(s.name)}" loading="lazy" />` : `<span>${esc(s.name)}</span>`)
    + (s.tier ? `<small>${esc(s.tier)}</small>` : '')
  const sponsors = site.sponsors.length ? `<div class="pf-esite-sponsors">${site.sponsors.map((s) =>
    s.url ? `<a class="pf-esite-sponsor" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.name)}">${sponsorInner(s)}</a>`
          : `<span class="pf-esite-sponsor" title="${esc(s.name)}">${sponsorInner(s)}</span>`).join('')}</div>` : ''
  const c = site.contacts
  const contacts = c && (c.email || c.phone || c.social) ? [
    c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '',
    c.phone ? esc(c.phone) : '', c.social ? esc(c.social) : '',
  ].filter(Boolean).join(' · ') : ''

  return `${renderPublicTopbar()}
    <header class="pf-esite-hero"><div class="pf-container">
      <div class="pf-eyebrow">Evento</div>
      <h1>${esc(event.name ?? event.sport)}</h1>
      ${site.tagline ? `<p class="pf-esite-tagline">${esc(site.tagline)}</p>` : ''}
      <div class="pf-esite-meta">${meta}</div>
      <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm);margin-top:var(--space-lg)">${navButtons(event, published)}</div>
    </div></header>
    ${section('Chi siamo', about)}
    ${section('Programma', program)}
    ${section('Dove si gioca', venueBlock)}
    <section class="pf-esite-sec"><div class="pf-container">
      <div class="pf-eyebrow">Categorie</div>
      <div class="pf-tabs" style="margin-top:var(--space-sm)">${catChips(event, published)}</div>
    </div></section>
    ${section('Con il sostegno di', sponsors)}
    ${section('Contatti', contacts)}
    <footer class="pf-esite-foot"><div class="pf-container">Sito realizzato con <b>PlayFusion</b> · <a href="#/events/${id}">${esc(event.name ?? event.sport)}</a></div></footer>`
}

/**
 * The public event page. When the organizer authored an event site (Pro), render the rich event
 * home; otherwise the basic results landing (no regression, no public gating).
 */
export function renderLanding(event: EventDetail, window: RegistrationWindowView, published = false, site?: ResolvedEventSite | null): string {
  return site && hasSiteContent(site)
    ? renderEventHome(event, window, published, site)
    : renderBasicLanding(event, window, published)
}
