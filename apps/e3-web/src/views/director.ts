import type { EventDetail, ScheduledMatchView } from '@playfusion/rest-client'
import type { O7Api } from '@playfusion/rest-client'
import { renderPublicTopbar, renderStepper, wireSteppers, readStepper, esc } from '@playfusion/app-shell'

/** The field director's scope, decoded from their magic-link (subject `director:<eventId>:<field>`).
 *  Client-side only, for display/filtering — the backend re-enforces the field on every write. */
export function directorScopeFromToken(token: string | null): { eventId: string; field: string } | null {
  if (!token) return null
  try {
    const body = token.split('.')[0] ?? ''
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { sub?: string }
    const parts = String(payload.sub ?? '').split(':')
    if (parts[0] !== 'director' || !parts[1]) return null
    return { eventId: parts[1], field: decodeURIComponent(parts.slice(2).join(':')) }
  } catch { return null }
}

const played = (m: ScheduledMatchView): boolean =>
  m.homeScore !== null && m.homeScore !== undefined && m.awayScore !== null && m.awayScore !== undefined

/** Compact, mobile-first list of the director's field matches — grouped by day, each a tappable
 *  row that opens the score stepper. */
function listBody(matches: ScheduledMatchView[]): string {
  if (!matches.length) return `<p class="pf-muted">Nessuna partita su questo campo.</p>`
  const days = [...new Set(matches.map((m) => m.day))].sort()
  return days.map((day) => {
    const rows = matches.filter((m) => m.day === day).sort((a, b) => a.time.localeCompare(b.time)).map((m) => `
      <button type="button" class="pf-dirmatch js-dirmatch" data-match="${esc(m.id)}">
        <span class="pf-mono">${esc(m.time)}</span>
        <span class="pf-dirmatch__teams">${esc(m.home)} <b>${played(m) ? `${esc(m.homeScore)}–${esc(m.awayScore)}` : 'vs'}</b> ${esc(m.away)}</span>
        <span class="pf-dirmatch__cat">${esc(m.categoryId)} · ${esc(m.groupLabel)}</span>
      </button>`).join('')
    return `<div class="pf-calday"><div class="pf-calday__head pf-mono">${esc(day)}</div>${rows}</div>`
  }).join('')
}

export function renderDirector(event: EventDetail, field: string, matches: ScheduledMatchView[]): string {
  const mine = matches.filter((m) => m.field === field)
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Direttore di campo</div><h1>${esc(field)}</h1>
        <div class="pf-mono pf-muted">${esc(event.name ?? event.sport)}</div></div>
      <div id="dir-err"></div>
      <div id="dir-panel"></div>
      <div id="dir-body">${listBody(mine)}</div>
    </main>`
}

/** Wires the director list: tap a match → stepper panel → save the result via o7 (the director
 *  token is attached by the client; the backend enforces the field). Updates the row in place. */
export function wireDirector(root: ParentNode, o7: O7Api, eventId: string, field: string, matches: ScheduledMatchView[]): void {
  const local = matches.filter((m) => m.field === field);
  const body = root.querySelector('#dir-body')!;
  const panel = root.querySelector('#dir-panel')!;
  const err = root.querySelector('#dir-err')!;

  function draw() {
    body.innerHTML = listBody(local);
    body.querySelectorAll<HTMLButtonElement>('.js-dirmatch').forEach((b) =>
      b.addEventListener('click', () => openPanel(b.dataset.match!)));
  }
  function openPanel(matchId: string) {
    const m = local.find((x) => x.id === matchId);
    if (!m) return;
    panel.innerHTML = `<div class="pf-card"><h3 class="pf-h4" style="margin-top:0">${esc(m.home)} vs ${esc(m.away)}</h3>
      <div class="pf-row" style="justify-content:center;gap:var(--space-2xl);align-items:flex-end">
        ${renderStepper('home', m.home, m.homeScore ?? 0)}
        ${renderStepper('away', m.away, m.awayScore ?? 0)}
      </div>
      <div class="pf-row" style="justify-content:center;gap:var(--space-sm);margin-top:var(--space-md)">
        <button type="button" class="pf-btn pf-btn--primary pf-btn--lg" id="dir-save">Salva</button>
        <button type="button" class="pf-btn" id="dir-cancel">Annulla</button>
      </div></div>`;
    wireSteppers(panel);
    panel.querySelector('#dir-cancel')!.addEventListener('click', () => { panel.innerHTML = ''; });
    panel.querySelector('#dir-save')!.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true;
      const homeScore = readStepper(panel, 'home'), awayScore = readStepper(panel, 'away');
      try {
        const updated = await o7.recordResult(eventId, matchId, { homeScore, awayScore });
        const i = local.findIndex((x) => x.id === matchId);
        if (i >= 0) local[i] = { ...local[i]!, homeScore: updated.homeScore, awayScore: updated.awayScore };
        panel.innerHTML = ''; draw();
      } catch { err.innerHTML = `<div class="pf-card" style="border-color:var(--color-feedback-danger)">Salvataggio non riuscito. Riprova.</div>`; btn.disabled = false; }
    });
  }
  draw();
}
