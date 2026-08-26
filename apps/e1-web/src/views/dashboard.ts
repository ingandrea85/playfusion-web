import type { EventSummary } from '@playfusion/rest-client'
import { renderOrganizerTopbar, esc } from '@playfusion/app-shell'
import type { Screen } from '../view.js'

export function renderDashboard(events: EventSummary[]): string {
  const cards = events.length
    ? events.map((e) => `<a class="pf-card pf-card--link" style="display:block;text-decoration:none;color:inherit" href="#/events/${encodeURIComponent(e.sportEventId)}">
        <div class="pf-eyebrow">${esc(e.sport)}</div>
        <h2 style="margin:6px 0 10px">${esc(e.sport)} · ${esc(e.categorie.join(', '))}</h2>
        <div class="pf-mono">${esc(e.dates.from)} → ${esc(e.dates.to)}</div>
      </a>`).join('')
    : `<div class="pf-card pf-muted">Nessun torneo ancora.</div>`
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container">
      <div class="pf-row" style="margin-bottom:var(--space-lg)">
        <div class="pf-pagehead" style="margin-bottom:0"><div class="pf-eyebrow">Stagione 2026</div><h1>I tuoi tornei</h1></div>
        <div class="pf-row" style="gap:var(--space-sm)">
          <a class="pf-btn" href="#/account/subscription">Abbonamento</a>
          <a class="pf-btn pf-btn--primary" href="#/events/new">＋ Crea evento</a>
        </div>
      </div>
      <div class="pf-stack">${cards}</div>
    </main>`
}

export const dashboardScreen: Screen<EventSummary[]> = {
  load: (ctx) => ctx.client.o3.listEvents(),
  render: renderDashboard,
}
