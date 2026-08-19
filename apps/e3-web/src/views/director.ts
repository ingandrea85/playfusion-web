import type { EventDetail, ScheduledMatchView } from '@playfusion/rest-client'
import type { O7Api } from '@playfusion/rest-client'
import {
  renderPublicTopbar, renderStepper, wireSteppers, readStepper, esc,
  displayStatus, matchStatusBadge, matchDelayLabel, openSheet, needsWinnerDecision, renderTabs, isFinalPhase,
  finalsPhaseTabs, finalsPhaseKey,
} from '@playfusion/app-shell'

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

// S12: finals show the resolved qualifier (else the placeholder) and a bracket/round label.
const dHome = (m: ScheduledMatchView): string => m.homeResolved ?? m.home
const dAway = (m: ScheduledMatchView): string => m.awayResolved ?? m.away
const dLabel = (m: ScheduledMatchView): string =>
  m.phase === 'FINAL' ? `${m.bracketLabel ?? 'Finali'}${m.round ? ` · ${m.round}` : ''}` : m.groupLabel

/** Compact, mobile-first list of the director's field matches — grouped by day, each a tappable
 *  row that opens the score bottom-sheet. Each row carries the S26 status badge + delay. */
function listBody(matches: ScheduledMatchView[], now: Date): string {
  if (!matches.length) return `<p class="pf-muted">Nessuna partita su questo campo.</p>`
  const days = [...new Set(matches.map((m) => m.day))].sort()
  return days.map((day) => {
    const rows = matches.filter((m) => m.day === day).sort((a, b) => a.time.localeCompare(b.time)).map((m) => {
      const st = displayStatus(m)
      const delay = matchDelayLabel(m, now)
      const cls = st === 'CANCELLED' ? ' pf-dirmatch--cancelled' : st === 'LIVE' ? ' pf-dirmatch--live' : ''
      return `
      <button type="button" class="pf-dirmatch js-dirmatch${cls}" data-match="${esc(m.id)}">
        <span class="pf-mono">${esc(m.time)}</span>
        <span class="pf-dirmatch__teams">${esc(dHome(m))} <b>${played(m) ? `${esc(m.homeScore)}–${esc(m.awayScore)}` : 'vs'}</b> ${esc(dAway(m))}</span>
        <span class="pf-dirmatch__cat">${esc(m.categoryId)} · ${esc(dLabel(m))} ${matchStatusBadge(m)}${needsWinnerDecision(m) ? '<span class="pf-mstatus pf-mstatus--decide">⚠ Chi passa?</span>' : ''}${delay ? `<span class="pf-delay">${esc(delay)}</span>` : ''}</span>
      </button>`
    }).join('')
    return `<div class="pf-calday"><div class="pf-calday__head pf-mono">${esc(day)}</div>${rows}</div>`
  }).join('')
}

// Tutte | Gironi | Finali — shown only when the field has both phases (shared UX with the calendars).
const dirFilterTabs = (mine: ScheduledMatchView[]): string =>
  mine.some(isFinalPhase) && mine.some((m) => !isFinalPhase(m))
    ? `<div id="dir-filter">${renderTabs([{ key: 'ALL', label: 'Tutte' }, { key: 'GROUP', label: 'Gironi' }, { key: 'FINALS', label: 'Finali' }], 'ALL')}</div>`
    : ''

export function renderDirector(event: EventDetail, field: string, matches: ScheduledMatchView[]): string {
  const mine = matches.filter((m) => m.field === field)
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Direttore di campo</div><h1>${esc(field)}</h1>
        <div class="pf-mono pf-muted">${esc(event.name ?? event.sport)}</div></div>
      <div id="dir-err"></div>
      ${dirFilterTabs(mine)}
      <div id="dir-phase"></div>
      <div id="dir-body">${listBody(mine, new Date())}</div>
      <div id="dir-sheet"></div>
    </main>`
}

/** Wires the director list: tap a match → bottom-sheet whose content depends on the match's
 *  lifecycle (S26). SCHEDULED → "Inizia" (kickoff); LIVE → score stepper + Salva/Termina;
 *  FINISHED/CANCELLED → read-only. The director token is attached by the client; the backend
 *  enforces the field. Updates the row in place after each action. */
export function wireDirector(root: ParentNode, o7: O7Api, eventId: string, field: string, matches: ScheduledMatchView[]): void {
  const local = matches.filter((m) => m.field === field)
  const body = root.querySelector('#dir-body')!
  const sheet = root.querySelector<HTMLElement>('#dir-sheet')!
  const err = root.querySelector('#dir-err')!

  const showError = () => { err.innerHTML = `<div class="pf-card" style="border-color:var(--color-feedback-danger)">Operazione non riuscita. Riprova.</div>` }
  const clearError = () => { err.innerHTML = '' }
  const upsert = (m: ScheduledMatchView) => { const i = local.findIndex((x) => x.id === m.id); if (i >= 0) local[i] = { ...local[i]!, ...m } }

  const filterbar = root.querySelector<HTMLElement>('#dir-filter')
  const phasebar = root.querySelector<HTMLElement>('#dir-phase')
  let filter = 'ALL'
  let phase = 'ALL'
  const shown = () => local.filter((m) => {
    if (filter === 'ALL') return true
    if (filter === 'GROUP') return !isFinalPhase(m)
    return isFinalPhase(m) && (phase === 'ALL' || finalsPhaseKey(m.round) === phase) // FINALS
  })

  function draw() {
    if (filterbar) {
      filterbar.innerHTML = renderTabs([{ key: 'ALL', label: 'Tutte' }, { key: 'GROUP', label: 'Gironi' }, { key: 'FINALS', label: 'Finali' }], filter)
      filterbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
        b.addEventListener('click', () => { filter = b.dataset.key!; phase = 'ALL'; draw() }))
    }
    if (phasebar) {
      const phaseTabs = filter === 'FINALS' ? finalsPhaseTabs(local) : []
      phasebar.innerHTML = phaseTabs.length ? `<div class="pf-tabs--sub">${renderTabs(phaseTabs, phase)}</div>` : ''
      phasebar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
        b.addEventListener('click', () => { phase = b.dataset.key!; draw() }))
    }
    body.innerHTML = listBody(shown(), new Date())
    body.querySelectorAll<HTMLButtonElement>('.js-dirmatch').forEach((b) =>
      b.addEventListener('click', () => openMatch(b.dataset.match!)))
  }

  function openMatch(matchId: string) {
    const m = local.find((x) => x.id === matchId)
    if (!m) return
    clearError()
    const st = displayStatus(m)
    const head = `<h3 class="pf-h4" style="margin-top:0">${esc(dHome(m))} vs ${esc(dAway(m))}</h3>
      <div class="pf-mono pf-muted" style="margin-bottom:var(--space-md)">${esc(m.time)} · ${esc(m.categoryId)} · ${esc(dLabel(m))} ${matchStatusBadge(m)}</div>`

    if (st === 'CANCELLED') {
      const { close } = openSheet(sheet, `${head}<p class="pf-muted">Gara annullata dall'organizzazione.</p>
        <div class="pf-row" style="justify-content:center;margin-top:var(--space-md)"><button type="button" class="pf-btn" id="dir-close">Chiudi</button></div>`)
      sheet.querySelector('#dir-close')!.addEventListener('click', close)
      return
    }
    if (st === 'FINISHED') {
      // Knockout ended level → the director decrees who advances (rules applied offline).
      const isDrawnFinal = m.phase === 'FINAL' && (m.homeScore ?? 0) === (m.awayScore ?? 0)
      const decideBlock = isDrawnFinal ? `<div style="margin-top:var(--space-md);text-align:center">
          <div class="pf-eyebrow" style="justify-content:center">Pareggio — chi passa?</div>
          <div class="pf-row" style="justify-content:center;gap:var(--space-sm);margin-top:var(--space-xs);flex-wrap:wrap">
            <button type="button" class="pf-btn${m.decidedWinner === 'HOME' ? ' pf-btn--primary' : ''}" id="dir-pass-home">${esc(dHome(m))}</button>
            <button type="button" class="pf-btn${m.decidedWinner === 'AWAY' ? ' pf-btn--primary' : ''}" id="dir-pass-away">${esc(dAway(m))}</button>
          </div></div>` : ''
      const { close } = openSheet(sheet, `${head}
        <div class="pf-row pf-mono" style="justify-content:center;font-size:34px;font-weight:700">${esc(m.homeScore ?? 0)} – ${esc(m.awayScore ?? 0)}</div>
        <p class="pf-muted" style="text-align:center">Gara terminata. Per correzioni contatta l'organizzazione.</p>${decideBlock}
        <div class="pf-row" style="justify-content:center;margin-top:var(--space-md)"><button type="button" class="pf-btn" id="dir-close">Chiudi</button></div>`)
      sheet.querySelector('#dir-close')!.addEventListener('click', close)
      const pass = async (winner: 'HOME' | 'AWAY', e: Event) => {
        const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true
        try { const u = await o7.decideWinner(eventId, matchId, winner); upsert(u); draw(); openMatch(matchId) }
        catch { showError(); close() }
      }
      sheet.querySelector('#dir-pass-home')?.addEventListener('click', (e) => pass('HOME', e))
      sheet.querySelector('#dir-pass-away')?.addEventListener('click', (e) => pass('AWAY', e))
      return
    }
    if (st === 'SCHEDULED') {
      const { close } = openSheet(sheet, `${head}<p class="pf-muted" style="text-align:center">Premi "Inizia" al fischio d'inizio.</p>
        <div class="pf-row" style="justify-content:center;gap:var(--space-sm);margin-top:var(--space-md)">
          <button type="button" class="pf-btn pf-btn--primary pf-btn--lg" id="dir-start">Inizia partita</button>
          <button type="button" class="pf-btn" id="dir-cancel">Annulla</button></div>`)
      sheet.querySelector('#dir-cancel')!.addEventListener('click', close)
      sheet.querySelector('#dir-start')!.addEventListener('click', async (e) => {
        const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true
        try { const u = await o7.startMatch(eventId, matchId); upsert(u); draw(); openMatch(matchId) } // re-open as LIVE
        catch { showError(); close() }
      })
      return
    }
    // LIVE: score stepper + Salva (keep live) / Termina (finalize).
    const { close } = openSheet(sheet, `${head}
      <div class="pf-row" style="justify-content:center;gap:var(--space-2xl);align-items:flex-end">
        ${renderStepper('home', dHome(m), m.homeScore ?? 0)}
        ${renderStepper('away', dAway(m), m.awayScore ?? 0)}
      </div>
      <div class="pf-row" style="justify-content:center;gap:var(--space-sm);margin-top:var(--space-md);flex-wrap:wrap">
        <button type="button" class="pf-btn pf-btn--primary pf-btn--lg" id="dir-finish">Termina</button>
        <button type="button" class="pf-btn pf-btn--lg" id="dir-save">Salva</button>
        <button type="button" class="pf-btn" id="dir-cancel">Chiudi</button>
      </div>`)
    wireSteppers(sheet)
    const scores = () => ({ homeScore: readStepper(sheet, 'home'), awayScore: readStepper(sheet, 'away') })
    sheet.querySelector('#dir-cancel')!.addEventListener('click', close)
    sheet.querySelector('#dir-save')!.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true
      try { const u = await o7.recordResult(eventId, matchId, scores()); upsert(u); draw(); close() }
      catch { showError(); btn.disabled = false }
    })
    sheet.querySelector('#dir-finish')!.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true
      try {
        await o7.recordResult(eventId, matchId, scores()) // persist the final score first
        const u = await o7.finishMatch(eventId, matchId)
        upsert(u); draw(); close()
      } catch { showError(); btn.disabled = false }
    })
  }

  draw()
}
