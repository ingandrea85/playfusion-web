import { esc } from './html.js'

export function renderOrganizerTopbar(active: string): string {
  const link = (href: string, label: string, key: string) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`
  return `<header class="pf-topbar">
    <a class="pf-brand" href="#/">play<b>fusion</b><small>Organizer</small></a>
    <nav>${link('#/', 'Eventi', 'dashboard')}</nav>
  </header>`
}

export interface WorkspaceHeader { name: string; meta: string; phaseLabel?: string; phaseMod?: 'prep' | 'live' | 'done' }
export interface WorkspaceTab { key: string; label: string; href: string }

export function renderOrganizerWorkspace(h: WorkspaceHeader, tabs: WorkspaceTab[], activeKey: string): string {
  const phase = h.phaseLabel ? `<span class="pf-wphase pf-wphase--${h.phaseMod ?? 'prep'}">${h.phaseLabel}</span>` : ''
  const nav = tabs.map((t) => `<a class="pf-wtab${t.key === activeKey ? ' pf-wtab--active' : ''}" href="${t.href}">${t.label}</a>`).join('')
  return `<div class="pf-whero">
    <div class="pf-whero__inner">${phase}<h1>${h.name}</h1><div class="pf-mono pf-muted">${h.meta}</div></div>
    <nav class="pf-wtabs">${nav}</nav>
  </div>`
}

export function renderPublicTopbar(brandHtml?: string): string {
  return `<header class="pf-publicbar"><a class="pf-brand" href="#/">${brandHtml ?? 'play<b>fusion</b>'}</a></header>`
}

/** S26 match lifecycle (mirrors rest-client/o7 MatchStatus). */
export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELLED'

/** Structural shape of a scheduled match for rendering — kept local so app-shell needs
 *  no dependency on rest-client (rest-client's ScheduledMatchView satisfies it). `id` is
 *  only needed in editable mode (E1 reschedule — S9). `status`/`startedAt` drive the S26
 *  lifecycle badges + delay. */
export interface CalendarMatch { id?: string; categoryId: string; groupLabel: string; day: string; time: string; field: string; home: string; away: string; homeScore?: number | null; awayScore?: number | null; status?: MatchStatus; startedAt?: string | null; phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP'; round?: string; bracketLabel?: string; decidedWinner?: 'HOME' | 'AWAY'; homeResolved?: string; awayResolved?: string }

/** A knockout (FINAL) match that finished level and has no decreed winner yet — the organizer/
 *  director still has to pick who advances. Used to flag such rows in the calendar/bracket/director. */
export function needsWinnerDecision(m: { phase?: string; homeScore?: number | null; awayScore?: number | null; status?: MatchStatus; decidedWinner?: 'HOME' | 'AWAY' }): boolean {
  return m.phase === 'FINAL' && m.status === 'FINISHED'
    && m.homeScore != null && m.awayScore != null && m.homeScore === m.awayScore && !m.decidedWinner
}
const decideBadge = (m: CalendarMatch): string =>
  needsWinnerDecision(m) ? '<span class="pf-mstatus pf-mstatus--decide">⚠ Chi passa?</span>' : ''

const played = (m: CalendarMatch): boolean =>
  m.homeScore !== null && m.homeScore !== undefined && m.awayScore !== null && m.awayScore !== undefined

/** The lifecycle status to display: the explicit `status` if set, else a legacy fallback —
 *  a statusless fixture with both scores reads as FINISHED, otherwise SCHEDULED. Mirrors the
 *  o7 backend's `effectiveStatus`/`countsForStandings` so FE and BE never disagree. */
export function displayStatus(m: CalendarMatch): MatchStatus {
  if (m.status) return m.status
  return played(m) ? 'FINISHED' : 'SCHEDULED'
}

const STATUS_META: Record<MatchStatus, { label: string; mod: string; dot: string }> = {
  SCHEDULED: { label: 'Programmata', mod: 'sched', dot: '' },
  LIVE: { label: 'In corso', mod: 'live', dot: '🔴 ' },
  FINISHED: { label: 'Finita', mod: 'done', dot: '' },
  CANCELLED: { label: 'Annullata', mod: 'cancel', dot: '' },
}

/** A colored status pill for a match (S26). */
export function matchStatusBadge(m: CalendarMatch): string {
  const meta = STATUS_META[displayStatus(m)]
  return `<span class="pf-mstatus pf-mstatus--${meta.mod}">${meta.dot}${meta.label}</span>`
}

/** A delay label relative to the kickoff, or null when on time (S26). A still-SCHEDULED match
 *  past its slot reads "in ritardo N′"; a LIVE match started after its slot reads "iniziata +N′".
 *  Times are naive wall-clock (venue-local); `now` is injectable for tests. */
export function matchDelayLabel(m: CalendarMatch, now: Date = new Date()): string | null {
  const sched = Date.parse(`${m.day}T${m.time}`)
  if (Number.isNaN(sched)) return null
  const s = displayStatus(m)
  if (s === 'SCHEDULED') {
    const late = Math.floor((now.getTime() - sched) / 60000)
    return late >= 1 ? `in ritardo ${late}′` : null
  }
  if (s === 'LIVE' && m.startedAt) {
    const started = Date.parse(m.startedAt)
    if (!Number.isNaN(started)) {
      const late = Math.floor((started - sched) / 60000)
      if (late >= 1) return `iniziata +${late}′`
    }
  }
  return null
}

/** Mount a mobile bottom-sheet into `host`, returning its content element + a `close()`. The
 *  sheet is anchored to the bottom of the viewport (thumb-reach) so the director never scrolls
 *  up to reach the score controls (S26). Tapping the backdrop closes it. */
export function openSheet(host: HTMLElement, innerHtml: string): { el: HTMLElement; close: () => void } {
  host.innerHTML = `<div class="pf-sheet-overlay"><div class="pf-sheet" role="dialog" aria-modal="true">${innerHtml}</div></div>`
  const overlay = host.querySelector<HTMLElement>('.pf-sheet-overlay')!
  const close = () => { host.innerHTML = '' }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  return { el: host.querySelector<HTMLElement>('.pf-sheet')!, close }
}

/** Calendar rendering — grouped by day, matches sorted by time then field. Shared by the E1
 *  organizer schedule screen and the E3 public calendar so the two never drift. `editable`
 *  (S9) adds a per-match "Modifica" button for the E1 reschedule editor; it defaults off so
 *  E3 stays read-only. */
export interface CalendarOptions { now?: Date; hideScheduledBadge?: boolean }
export function renderCalendar(matches: CalendarMatch[], catName: (id: string) => string, editable = false, opts: CalendarOptions = {}): string {
  if (!matches.length) return `<p class="pf-muted">Nessuna partita in calendario.</p>`
  const now = opts.now ?? new Date()
  const days = [...new Set(matches.map((m) => m.day))].sort()
  return days.map((day) => {
    const rows = matches.filter((m) => m.day === day)
      .sort((a, b) => a.time.localeCompare(b.time) || a.field.localeCompare(b.field))
      .map((m) => {
        const st = displayStatus(m)
        const delay = matchDelayLabel(m, now)
        // On the public calendar the SCHEDULED pill is suppressed (noise on upcoming rows);
        // LIVE/FINISHED/CANCELLED always show.
        const badge = opts.hideScheduledBadge && st === 'SCHEDULED' ? '' : matchStatusBadge(m)
        return `<li class="pf-match${st === 'CANCELLED' ? ' pf-match--cancelled' : ''}">
        <span class="pf-match__time pf-mono">${esc(m.time)}</span>
        <span class="pf-match__field pf-mono">${esc(m.field)}</span>
        <span class="pf-match__cat">${esc(catName(m.categoryId))} · ${esc(m.phase === 'FINAL' ? `${m.bracketLabel ?? 'Finali'}${m.round ? ` · ${m.round}` : ''}` : m.groupLabel)} ${badge}${decideBadge(m)}${delay ? `<span class="pf-delay">${esc(delay)}</span>` : ''}</span>
        <span class="pf-match__teams">${esc(m.homeResolved ?? m.home)} <b>${played(m) ? `${esc(m.homeScore)}–${esc(m.awayScore)}` : 'vs'}</b> ${esc(m.awayResolved ?? m.away)}</span>
        ${editable ? `<span class="pf-match__actions"><button type="button" class="pf-btn pf-btn--ghost js-resultmatch" data-match="${esc(m.id ?? '')}">Risultato</button><button type="button" class="pf-btn pf-btn--ghost js-editmatch" data-match="${esc(m.id ?? '')}">Modifica</button></span>` : ''}
      </li>`
      }).join('')
    return `<div class="pf-calday"><div class="pf-calday__head pf-mono">${esc(day)}</div><ul class="pf-callist">${rows}</ul></div>`
  }).join('')
}

/** Big tappable −/+ score stepper (S25, mobile-first). `id` is unique within the form
 *  (e.g. 'home'/'away'); read the value back with readStepper and wire the buttons with
 *  wireSteppers after mounting. Value clamps at 0. */
export function renderStepper(id: string, label: string, value = 0): string {
  return `<div class="pf-stepper">
    <div class="pf-stepper__label">${esc(label)}</div>
    <div class="pf-stepper__ctl">
      <button type="button" class="pf-stepper__btn" data-step="${esc(id)}" data-delta="-1" aria-label="meno">−</button>
      <span class="pf-stepper__val" id="stp-${esc(id)}">${Math.max(0, Math.floor(value))}</span>
      <button type="button" class="pf-stepper__btn" data-step="${esc(id)}" data-delta="1" aria-label="più">+</button>
    </div>
  </div>`
}
export function wireSteppers(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const el = root.querySelector<HTMLElement>(`#stp-${b.dataset.step}`); if (!el) return
    el.textContent = String(Math.max(0, (Number(el.textContent) || 0) + Number(b.dataset.delta)))
  }))
}
export const readStepper = (root: ParentNode, id: string): number =>
  Math.max(0, Number(root.querySelector<HTMLElement>(`#stp-${id}`)?.textContent ?? '0') || 0)

/** Category/girone filter tabs (S23) — shared by the calendar & standings surfaces (E1+E3).
 *  Stateless: screens read `data-key` on click and re-render. Scrollable on mobile. */
export interface Tab { key: string; label: string }
export function renderTabs(items: Tab[], activeKey: string): string {
  if (!items.length) return ''
  return `<nav class="pf-tabs">${items.map((t) =>
    `<button type="button" class="pf-tab${t.key === activeKey ? ' pf-tab--active' : ''}" data-key="${esc(t.key)}" aria-selected="${t.key === activeKey}">${esc(t.label)}</button>`).join('')}</nav>`
}
/** Distinct categoryIds in first-seen order (from matches or standings groups). */
export function categoryKeys(items: Array<{ categoryId: string }>): string[] {
  const out: string[] = []
  for (const i of items) if (!out.includes(i.categoryId)) out.push(i.categoryId)
  return out
}
/** Distinct groupLabels of one category, first-seen order. Finals (phase FINAL) are excluded so
 *  their bracket labels never appear as girone tabs (S12). */
export function groupKeys(items: Array<{ categoryId: string; groupLabel: string; phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP' }>, categoryId: string): string[] {
  const out: string[] = []
  for (const i of items) if (i.categoryId === categoryId && i.phase !== 'FINAL' && !out.includes(i.groupLabel)) out.push(i.groupLabel)
  return out
}

/** S13: shared calendar filter — one UX across E1 organizer, E3 public and the director view. The
 *  girone tab bar lists the real gironi + a "Finali" tab; "Tutti" shows the whole category. */
export const FINALS_TAB = 'FINALS'
export const isFinalPhase = (m: { phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP' }): boolean => m.phase === 'FINAL' || m.phase === 'FINAL_GROUP'
export function calendarGironeTabs<T extends { categoryId: string; groupLabel: string; phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP' }>(matches: T[], categoryId: string): { key: string; label: string }[] {
  const gironi = groupKeys(matches.filter((m) => !isFinalPhase(m)), categoryId).map((g) => ({ key: g, label: g }))
  const tabs = [{ key: 'ALL', label: 'Tutti' }, ...gironi]
  if (matches.some((m) => m.categoryId === categoryId && isFinalPhase(m))) tabs.push({ key: FINALS_TAB, label: 'Finali' })
  return tabs
}
export function filterCalendarMatches<T extends { categoryId: string; groupLabel: string; phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP' }>(matches: T[], categoryId: string, selGir: string): T[] {
  return matches.filter((m) => {
    if (m.categoryId !== categoryId) return false
    if (selGir === 'ALL') return true
    if (selGir === FINALS_TAB) return isFinalPhase(m)
    return !isFinalPhase(m) && m.groupLabel === selGir
  })
}

/** Structural standings shapes (app-shell stays free of rest-client; its DTOs satisfy these). */
export interface StandingRowView { team: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; goalDiff: number; points: number }
export interface GroupStandingView { categoryId: string; groupLabel: string; rows: StandingRowView[] }

/** Standings tables, one per group (S10). Shared by the E1 Classifiche tab and the E3 public
 *  standings — read-only in both. Rows are pre-sorted by the caller (o7 standings engine). */
export function renderStandings(groups: GroupStandingView[], catName: (id: string) => string): string {
  if (!groups.length) return `<p class="pf-muted">Nessuna classifica: genera il calendario e inserisci i risultati.</p>`
  return groups.map((g) => {
    const rows = g.rows.map((r, i) => `<tr>
      <td class="pf-mono">${i + 1}</td><td>${esc(r.team)}</td>
      <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
      <td>${r.goalsFor}</td><td>${r.goalsAgainst}</td><td>${r.goalDiff}</td><td><b>${r.points}</b></td>
    </tr>`).join('')
    return `<div class="pf-standings">
      <div class="pf-calday__head pf-mono">${esc(catName(g.categoryId))} · ${esc(g.groupLabel)}</div>
      <table class="pf-table"><thead><tr>
        <th>#</th><th>Squadra</th><th>PG</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>Pti</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`
  }).join('')
}

/** Structural finals match shape (app-shell stays free of rest-client). */
export interface BracketMatch { categoryId: string; bracketLabel?: string; round?: string; order?: number; day?: string; time?: string; field?: string; home: string; away: string; homeResolved?: string; awayResolved?: string; status?: MatchStatus; homeScore?: number | null; awayScore?: number | null; phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP'; decidedWinner?: 'HOME' | 'AWAY' }

/** Which side won a finished match: by score, or (on a draw) the decreed winner; null if not decided. */
export function winnerSide(m: BracketMatch): 'HOME' | 'AWAY' | null {
  if (m.status !== 'FINISHED' || m.homeScore == null || m.awayScore == null) return null
  if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? 'HOME' : 'AWAY'
  return m.decidedWinner ?? null
}

/** Human label for a round code (S13 v1 uses R64/R32/R16/QF/SF/F). Non-code rounds (e.g.
 *  "Finale 1º/2º", "Girone finale") pass through unchanged. */
const ROUND_LABEL: Record<string, string> = { R64: 'Sedicesimi', R32: 'Sedicesimi', R16: 'Ottavi', QF: 'Quarti', SF: 'Semifinali', F: 'Finale' }
export function roundLabel(round: string): string { return ROUND_LABEL[round] ?? round }

/** S12/S13: the finals for one category, grouped bracket → round, each match showing the resolved
 *  team when known (`homeResolved ?? home`, incl. propagated winners) else the placeholder. Read-only;
 *  shared by the E1 Finali tab and the E3 public Tabellone. Rows carry time · field when scheduled.
 *  Includes FINAL_GROUP (the round-robin final group) as its own bracket section. */
export function renderBracket(finals: BracketMatch[], catName: (id: string) => string): string {
  if (!finals.length) return `<p class="pf-muted">Nessun tabellone: configura la fase finale e genera il calendario.</p>`
  const brackets = [...new Set(finals.map((f) => f.bracketLabel ?? 'Finali'))]
  return brackets.map((bl) => {
    const inBracket = finals.filter((f) => (f.bracketLabel ?? 'Finali') === bl)
    const rounds = [...new Set(inBracket.map((f) => f.round ?? ''))]
    const body = rounds.map((rd) => {
      const rows = inBracket.filter((f) => (f.round ?? '') === rd)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((f) => {
          const w = winnerSide(f)
          const hn = esc(f.homeResolved ?? f.home), an = esc(f.awayResolved ?? f.away)
          const mid = f.homeScore != null && f.awayScore != null ? `${esc(f.homeScore)}–${esc(f.awayScore)}` : 'vs'
          const decide = needsWinnerDecision(f) ? ' <span class="pf-mstatus pf-mstatus--decide">⚠ Chi passa?</span>' : ''
          return `<li class="pf-brk__match">
          ${f.time || f.field ? `<span class="pf-brk__slot pf-mono">${esc([f.time, f.field].filter(Boolean).join(' · '))}</span>` : ''}
          <span class="pf-brk__teams"><span class="${w === 'HOME' ? 'pf-brk__win' : ''}">${w === 'HOME' ? '✓ ' : ''}${hn}</span> <b>${mid}</b> <span class="${w === 'AWAY' ? 'pf-brk__win' : ''}">${w === 'AWAY' ? '✓ ' : ''}${an}</span>${decide}</span>
        </li>`
        }).join('')
      return `${rd ? `<div class="pf-brk__round pf-mono">${esc(roundLabel(rd))}</div>` : ''}<ul class="pf-brk__list">${rows}</ul>`
    }).join('')
    const cat = catName(inBracket[0]!.categoryId)
    return `<div class="pf-bracket"><div class="pf-calday__head pf-mono">${esc(cat)} · ${esc(bl)}</div>${body}</div>`
  }).join('')
}

export function renderCategoryTag(name: string, count: number, maxTeams: number): string {
  const full = maxTeams > 0 && count >= maxTeams
  // Only the enrolled/total count — just the numbers, no label, no "completa", no bar.
  const cap = maxTeams > 0 ? `${count}/${maxTeams}` : `${count}`
  return `<li class="pf-cat${full ? ' pf-cat--full' : ''}">
    <span class="pf-cat__label">${esc(name)}</span>
    <div class="pf-cat__body"><div class="pf-cat__cap">${cap}</div></div>
  </li>`
}
