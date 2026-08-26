import { esc } from './html.js'
import { brandWordmark } from './brand.js'

export function renderOrganizerTopbar(active: string): string {
  const link = (href: string, label: string, key: string) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`
  return `<header class="pf-topbar">
    <a class="pf-brand" href="#/">${brandWordmark()}<small>Organizer</small></a>
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
  return `<header class="pf-publicbar"><a class="pf-brand" href="#/">${brandHtml ?? brandWordmark()}</a></header>`
}

/** S26 match lifecycle (mirrors rest-client/o7 MatchStatus). */
export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELLED'

/** Structural shape of a scheduled match for rendering — kept local so app-shell needs
 *  no dependency on rest-client (rest-client's ScheduledMatchView satisfies it). `id` is
 *  only needed in editable mode (E1 reschedule — S9). `status`/`startedAt` drive the S26
 *  lifecycle badges + delay. */
export interface CalendarMatch { id?: string; categoryId: string; groupLabel: string; day: string; time: string; field: string; home: string; away: string; homeScore?: number | null; awayScore?: number | null; status?: MatchStatus; startedAt?: string | null; phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP'; round?: string; bracketLabel?: string; placementFrom?: number; placementTo?: number; decidedWinner?: 'HOME' | 'AWAY'; homeResolved?: string; awayResolved?: string }

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
        <span class="pf-match__cat">${esc(catName(m.categoryId))} · ${esc(m.phase === 'FINAL' ? `${m.bracketLabel ?? 'Finali'}${m.round ? ` · ${roundLabel(m.round)}` : ''}` : m.groupLabel)}${m.phase === 'FINAL' && m.placementFrom != null && m.placementTo === m.placementFrom + 1 ? ` <span class="pf-brk__pos">${m.placementFrom}º/${m.placementTo}º</span>` : ''} ${badge}${decideBadge(m)}${delay ? `<span class="pf-delay">${esc(delay)}</span>` : ''}</span>
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
/** S13: dynamic phase sub-filter for the finals. The code rounds (QF/SF/F…) each get their own tab in
 *  bracket order; all classification/placement finals (3º/4º, 5º/6º, spareggi, girone finale) collapse
 *  under a single "Piazzamenti" so the bar never explodes. Returns [] when a category has fewer than 2
 *  finals phases (nothing worth sub-filtering). Shown only while the "Finali" tab is active. */
const PHASE_ORDER = ['R64', 'R32', 'R16', 'QF', 'SF', 'F']
export const PLACEMENTS_PHASE = 'PIAZZAMENTI'
export const finalsPhaseKey = (round?: string): string => (round && CODE_ROUNDS.has(round) ? round : PLACEMENTS_PHASE)
export function finalsPhaseTabs<T extends { categoryId: string; round?: string; phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP' }>(matches: T[], categoryId?: string): Tab[] {
  const present = new Set<string>()
  for (const m of matches) if ((!categoryId || m.categoryId === categoryId) && isFinalPhase(m)) present.add(finalsPhaseKey(m.round))
  if (present.size < 2) return []
  const idx = (k: string): number => (k === PLACEMENTS_PHASE ? 999 : PHASE_ORDER.indexOf(k))
  const tabs = [...present].sort((a, b) => idx(a) - idx(b)).map((k) => ({ key: k, label: k === PLACEMENTS_PHASE ? 'Piazzamenti' : roundLabel(k) }))
  return [{ key: 'ALL', label: 'Tutte' }, ...tabs]
}
export function filterCalendarMatches<T extends { categoryId: string; groupLabel: string; round?: string; phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP' }>(matches: T[], categoryId: string, selGir: string, selPhase = 'ALL'): T[] {
  return matches.filter((m) => {
    if (m.categoryId !== categoryId) return false
    if (selGir === 'ALL') return true
    if (selGir === FINALS_TAB) return isFinalPhase(m) && (selPhase === 'ALL' || finalsPhaseKey(m.round) === selPhase)
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
export interface BracketMatch { categoryId: string; bracketLabel?: string; round?: string; order?: number; slot?: string; placementFrom?: number; placementTo?: number; day?: string; time?: string; field?: string; home: string; away: string; homeResolved?: string; awayResolved?: string; status?: MatchStatus; homeScore?: number | null; awayScore?: number | null; phase?: 'GROUP' | 'FINAL' | 'FINAL_GROUP'; decidedWinner?: 'HOME' | 'AWAY' }

/** Which side won a finished match: by score, or (on a draw) the decreed winner; null if not decided. */
export function winnerSide(m: BracketMatch): 'HOME' | 'AWAY' | null {
  if (m.status !== 'FINISHED' || m.homeScore == null || m.awayScore == null) return null
  if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? 'HOME' : 'AWAY'
  return m.decidedWinner ?? null
}

/** Human label for a round code (S13 v1 uses R64/R32/R16/QF/SF/F). Non-code rounds (e.g.
 *  "Finale 1º/2º", "Girone finale") pass through unchanged. */
const ROUND_LABEL: Record<string, string> = { R64: 'Trentaduesimi', R32: 'Sedicesimi', R16: 'Ottavi', QF: 'Quarti', SF: 'Semifinali', F: 'Finale' }
export function roundLabel(round: string): string { return ROUND_LABEL[round] ?? round }

const CODE_ROUNDS = new Set(['R64', 'R32', 'R16', 'QF', 'SF', 'F'])
const roundsInOrder = (ms: BracketMatch[]): string[] => { const o: string[] = []; for (const m of ms) { const r = m.round ?? ''; if (!o.includes(r)) o.push(r) } return o }
const sortByOrder = (ms: BracketMatch[]): BracketMatch[] => [...ms].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

/** S13 (variante B): downstream placement range each match feeds into — follow its Vincente/Perdente
 *  links forward to the 2-wide finals and take the min/max place. Lets feeder rounds (Quarti,
 *  Semifinali, spareggi) show the positions they ultimately decide. Keyed by slot. */
function downstreamRanges(ms: BracketMatch[]): Map<string, [number, number]> {
  const REF = /^(?:Vincente|Perdente) (.+)$/
  const children = new Map<string, BracketMatch[]>()
  for (const m of ms) for (const side of [m.home, m.away]) {
    const r = REF.exec(side ?? ''); if (!r) continue
    const arr = children.get(r[1]!) ?? []; arr.push(m); children.set(r[1]!, arr)
  }
  const memo = new Map<string, [number, number]>()
  const visit = (m: BracketMatch, seen: Set<string>): [number, number] => {
    if (m.slot && memo.has(m.slot)) return memo.get(m.slot)!
    let lo = Infinity, hi = -Infinity
    if (m.placementFrom != null && m.placementTo != null) { lo = Math.min(lo, m.placementFrom); hi = Math.max(hi, m.placementTo) }
    if (m.slot && !seen.has(m.slot)) {
      seen.add(m.slot)
      for (const c of children.get(m.slot) ?? []) { const [clo, chi] = visit(c, seen); lo = Math.min(lo, clo); hi = Math.max(hi, chi) }
    }
    const range: [number, number] = [lo, hi]
    if (m.slot) memo.set(m.slot, range)
    return range
  }
  const out = new Map<string, [number, number]>()
  for (const m of ms) if (m.slot) out.set(m.slot, visit(m, new Set()))
  return out
}

/** A match's position badge: a 2-wide final shows its exact pair ("1º/2º"); a feeder shows the range it
 *  decides ("5º–8º"), from downstreamRanges. */
interface PosBadge { chip?: string; feed?: string }
function posBadge(m: BracketMatch, ranges: Map<string, [number, number]>): PosBadge {
  if (m.placementFrom != null && m.placementTo === m.placementFrom + 1) return { chip: `${m.placementFrom}º/${m.placementTo}º` }
  const r = m.slot ? ranges.get(m.slot) : undefined
  if (r && Number.isFinite(r[0]) && r[0] !== r[1]) return { feed: `${r[0]}º–${r[1]}º` }
  return {}
}
const posSort = (m: BracketMatch, ranges: Map<string, [number, number]>): number =>
  m.placementFrom ?? (m.slot ? ranges.get(m.slot)?.[0] : undefined) ?? 999

const teamsSpan = (f: BracketMatch): string => {
  const w = winnerSide(f)
  const hn = esc(f.homeResolved ?? f.home), an = esc(f.awayResolved ?? f.away)
  const mid = f.homeScore != null && f.awayScore != null ? `${esc(f.homeScore)}–${esc(f.awayScore)}` : 'vs'
  const decide = needsWinnerDecision(f) ? ' <span class="pf-mstatus pf-mstatus--decide">⚠ Chi passa?</span>' : ''
  return `<span class="pf-brk__teams"><span class="${w === 'HOME' ? 'pf-brk__win' : ''}">${w === 'HOME' ? '✓ ' : ''}${hn}</span> <b>${mid}</b> <span class="${w === 'AWAY' ? 'pf-brk__win' : ''}">${w === 'AWAY' ? '✓ ' : ''}${an}</span>${decide}</span>`
}
const badgeSpan = (b: PosBadge): string =>
  b.chip ? `<span class="pf-brk__pos">${esc(b.chip)}</span>` : b.feed ? `<span class="pf-brk__pos pf-brk__pos--range">${esc(b.feed)}</span>` : ''

/** One match as a stacked two-team card (bracket tree); a 2-wide final carries its position chip. */
function bracketCard(f: BracketMatch, badge: PosBadge): string {
  const w = winnerSide(f)
  const side = (raw: string, resolved: string | undefined, score: number | null | undefined, isWin: boolean) =>
    `<div class="pf-brk__t${isWin ? ' pf-brk__t--win' : ''}${resolved ? '' : ' pf-brk__t--tbd'}">
      <span class="nm">${isWin ? '✓ ' : ''}${esc(resolved ?? raw)}</span>
      <span class="sc pf-mono">${score != null ? esc(score) : '—'}</span>
    </div>`
  return `<div class="pf-brk__m">
    ${badge.chip ? `<div class="pf-brk__mpos">${badgeSpan(badge)}</div>` : ''}
    ${side(f.home, f.homeResolved, f.homeScore, w === 'HOME')}
    ${side(f.away, f.awayResolved, f.awayScore, w === 'AWAY')}
    ${needsWinnerDecision(f) ? '<div class="pf-brk__badge">⚠ Chi passa?</div>' : ''}
  </div>`
}

/** The per-round list (mobile fallback + non-tree brackets). `ranges` (optional) adds position chips. */
function bracketList(inBracket: BracketMatch[], rounds: string[], ranges?: Map<string, [number, number]>): string {
  return rounds.map((rd) => {
    const rows = sortByOrder(inBracket.filter((f) => (f.round ?? '') === rd)).map((f) => {
      const badge = ranges ? badgeSpan(posBadge(f, ranges)) : ''
      return `<li class="pf-brk__match">
        ${f.time || f.field ? `<span class="pf-brk__slot pf-mono">${esc([f.time, f.field].filter(Boolean).join(' · '))}</span>` : ''}
        ${badge}${teamsSpan(f)}
      </li>`
    }).join('')
    return `${rd ? `<div class="pf-brk__round pf-mono">${esc(roundLabel(rd))}</div>` : ''}<ul class="pf-brk__list">${rows}</ul>`
  }).join('')
}

/** The classification/placement finals under the main tree: a flat list, each row led by its position
 *  badge (exact pair for a final, range for a spareggio feeder). Ordered by target position. */
function placementList(placeMs: BracketMatch[], ranges: Map<string, [number, number]>): string {
  const rows = [...placeMs]
    .sort((a, b) => (posSort(a, ranges) - posSort(b, ranges)) || (a.order ?? 0) - (b.order ?? 0))
    .map((f) => `<li class="pf-brk__prow">${badgeSpan(posBadge(f, ranges))}${teamsSpan(f)}</li>`).join('')
  return `<ul class="pf-brk__plist">${rows}</ul>`
}

/** The graphical bracket tree: one column per round, connectors in pure CSS. Feeder round headers show
 *  the range they decide ("→ 1º–4º"); each column's cards carry their own position chip when final. */
function bracketTree(inBracket: BracketMatch[], rounds: string[], ranges: Map<string, [number, number]>): string {
  const heads = rounds.map((rd) => {
    const ms = inBracket.filter((f) => (f.round ?? '') === rd)
    const feed = ms.length ? posBadge(ms[0]!, ranges).feed : undefined
    return `<div>${esc(roundLabel(rd))}${feed ? ` <span class="pf-brk__feed">→ ${esc(feed)}</span>` : ''}</div>`
  }).join('')
  const cols = rounds.map((rd, i) => {
    const ms = sortByOrder(inBracket.filter((f) => (f.round ?? '') === rd))
    return `<div class="pf-brk__col${i === rounds.length - 1 ? ' pf-brk__col--last' : ''}" style="--n:${ms.length}">${ms.map((m) => bracketCard(m, posBadge(m, ranges))).join('')}</div>`
  }).join('')
  return `<div class="pf-brk-tree-wrap"><div class="pf-brk-heads">${heads}</div><div class="pf-brk-tree">${cols}</div></div>`
}

/** The bracket-level position range chip, e.g. "posizioni 1º–8º", from the 2-wide finals present. */
function bracketRangeChip(inBracket: BracketMatch[]): string {
  const fins = inBracket.filter((f) => f.placementFrom != null && f.placementTo === f.placementFrom + 1)
  if (!fins.length) return ''
  const lo = Math.min(...fins.map((f) => f.placementFrom!)), hi = Math.max(...fins.map((f) => f.placementTo!))
  return `<span class="pf-brk__pos pf-brk__pos--range">posizioni ${lo}º–${hi}º</span>`
}

/** S12/S13 (variante B): the finals for one category. The main knockout path (code rounds QF/SF/F)
 *  renders as a graphical tree — column headers show the range each feeder round decides ("→ 1º–4º")
 *  and each 2-wide final carries its position chip ("1º/2º"); the classification/placement finals
 *  (3º/4º, 5º/6º, spareggi …) list below, each led by its position badge. The bracket head shows the
 *  overall range ("posizioni 1º–8º"). Non-tree brackets (single finals, girone finale) stay a plain
 *  list. Winner highlighted (✓), drawn KO flagged "⚠ Chi passa?", unresolved slots muted. Read-only. */
export function renderBracket(finals: BracketMatch[], catName: (id: string) => string): string {
  if (!finals.length) return `<p class="pf-muted">Nessun tabellone: configura la fase finale e genera il calendario.</p>`
  const brackets = [...new Set(finals.map((f) => f.bracketLabel ?? 'Finali'))]
  return brackets.map((bl) => {
    const inBracket = finals.filter((f) => (f.bracketLabel ?? 'Finali') === bl)
    const rounds = roundsInOrder(inBracket)
    const codeRounds = rounds.filter((r) => CODE_ROUNDS.has(r))
    const hasTree = codeRounds.length >= 2
    const ranges = downstreamRanges(inBracket)
    const head = `<div class="pf-calday__head pf-mono">${esc(catName(inBracket[0]!.categoryId))} · ${esc(bl)} ${bracketRangeChip(inBracket)}</div>`
    let body: string
    if (hasTree) {
      const treeMs = inBracket.filter((f) => CODE_ROUNDS.has(f.round ?? ''))
      const placeMs = inBracket.filter((f) => !CODE_ROUNDS.has(f.round ?? ''))
      const tree = `<div class="pf-brk-desktop">${bracketTree(treeMs, codeRounds, ranges)}</div><div class="pf-brk-fallback">${bracketList(treeMs, codeRounds, ranges)}</div>`
      const placements = placeMs.length
        ? `<div class="pf-brk-placements"><div class="pf-brk__sub pf-mono">Piazzamenti</div>${placementList(placeMs, ranges)}</div>`
        : ''
      body = tree + placements
    } else {
      body = bracketList(inBracket, rounds)
    }
    return `<div class="pf-bracket">${head}${body}</div>`
  }).join('')
}

/** S13: one category's progressive final ranking (podium/placements). `team` set = decided;
 *  otherwise "— da definire" (a result/decision/tie still pending). */
export interface FinalStandingRowView { position: number; team?: string; pending?: 'result' | 'tie' }
export function renderFinalStanding(rows: FinalStandingRowView[]): string {
  if (!rows.length) return `<p class="pf-muted">Classifica finale non ancora disponibile: gioca le fasi finali.</p>`
  const li = rows.map((r) => `<li class="pf-finrank__row">
    <span class="pf-finrank__pos pf-mono">${r.position}º</span>
    <span>${r.team ? esc(r.team) : `<span class="pf-muted">— da definire${r.pending === 'tie' ? ' (parità da risolvere)' : ''}</span>`}</span>
  </li>`).join('')
  return `<ol class="pf-finrank">${li}</ol>`
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
