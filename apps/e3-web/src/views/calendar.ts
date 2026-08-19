import type { EventDetail, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderCalendar, renderTabs, categoryKeys, groupKeys, esc } from '@playfusion/app-shell'

const catName = (c: string): string => c
// The public calendar shows only the group phase; the finals live in the Tabellone tab (no
// duplication). E1/director keep finals inline in their calendar (needed for result entry).
const groupPhaseOnly = (matches: ScheduledMatchView[]): ScheduledMatchView[] =>
  matches.filter((m) => !m.phase || m.phase === 'GROUP')
const filterMatches = (matches: ScheduledMatchView[], selCat: string, selGir: string): ScheduledMatchView[] =>
  matches.filter((m) => m.categoryId === selCat && (selGir === 'ALL' || m.groupLabel === selGir))

/** Public, read-only match calendar (S7) with Category + Girone filter tabs (S23). Gated on
 *  PUBLISHED; scores shown when a match is played. Call wirePublicCalendar after mounting. */
export function renderPublicCalendar(event: EventDetail, schedule: ScheduleView, allMatches: ScheduledMatchView[]): string {
  const id = encodeURIComponent(event.sportEventId)
  const published = schedule.status === 'PUBLISHED'
  const matches = groupPhaseOnly(allMatches)
  const selCat = categoryKeys(matches)[0] ?? ''
  const inner = published
    ? `<div id="cal-cattabs">${renderTabs(categoryKeys(matches).map((c) => ({ key: c, label: c })), selCat)}</div>
       <div id="cal-girtabs">${renderTabs([{ key: 'ALL', label: 'Tutti' }, ...groupKeys(matches, selCat).map((g) => ({ key: g, label: g }))], 'ALL')}</div>
       <div id="calbody">${renderCalendar(filterMatches(matches, selCat, 'ALL'), catName)}</div>`
    : `<p class="pf-muted">Il calendario non è ancora stato pubblicato.</p>`
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">${esc(event.name ?? event.sport)}</div><h1>Calendario</h1></div>
      <div class="pf-card">${inner}</div>
      <div class="pf-row"><a class="pf-btn" href="#/events/${id}">← Torna all'evento</a></div>
    </main>`
}

/** Wires the category/girone tabs (S23): redraws the tab bars + calendar body on each change. */
export function wirePublicCalendar(root: ParentNode, allMatches: ScheduledMatchView[]): void {
  const calbody = root.querySelector('#calbody'); if (!calbody) return
  const matches = groupPhaseOnly(allMatches)
  const catbar = root.querySelector('#cal-cattabs')!
  const girbar = root.querySelector('#cal-girtabs')!
  let selCat = categoryKeys(matches)[0] ?? ''
  let selGir = 'ALL'
  function draw() {
    catbar.innerHTML = renderTabs(categoryKeys(matches).map((c) => ({ key: c, label: c })), selCat)
    catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; draw() }))
    girbar.innerHTML = renderTabs([{ key: 'ALL', label: 'Tutti' }, ...groupKeys(matches, selCat).map((g) => ({ key: g, label: g }))], selGir)
    girbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selGir = b.dataset.key!; draw() }))
    calbody!.innerHTML = renderCalendar(filterMatches(matches, selCat, selGir), catName, false, { hideScheduledBadge: true })
  }
  draw()
}
