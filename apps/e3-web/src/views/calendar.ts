import type { EventDetail, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderCalendar, renderTabs, categoryKeys, esc, calendarGironeTabs, filterCalendarMatches } from '@playfusion/app-shell'

const catName = (c: string): string => c
const gironeTabs = (matches: ScheduledMatchView[], selCat: string) => calendarGironeTabs(matches, selCat)
const filterMatches = (matches: ScheduledMatchView[], selCat: string, selGir: string) => filterCalendarMatches(matches, selCat, selGir)

/** Public, read-only calendar (S7) with Category + (Gironi | Finali) filter tabs. Gated on PUBLISHED;
 *  scores shown when played (finals included, so results are visible). Call wirePublicCalendar after. */
export function renderPublicCalendar(event: EventDetail, schedule: ScheduleView, matches: ScheduledMatchView[], initialCat?: string): string {
  const id = encodeURIComponent(event.sportEventId)
  const published = schedule.status === 'PUBLISHED'
  const keys = categoryKeys(matches)
  const selCat = (initialCat && keys.includes(initialCat) ? initialCat : keys[0]) ?? ''
  const inner = published
    ? `<div id="cal-cattabs">${renderTabs(keys.map((c) => ({ key: c, label: c })), selCat)}</div>
       <div id="cal-girtabs">${renderTabs(gironeTabs(matches, selCat), 'ALL')}</div>
       <div id="calbody">${renderCalendar(filterMatches(matches, selCat, 'ALL'), catName)}</div>`
    : `<p class="pf-muted">Il calendario non è ancora stato pubblicato.</p>`
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">${esc(event.name ?? event.sport)}</div><h1>Calendario</h1></div>
      <div class="pf-card">${inner}</div>
      <div class="pf-row"><a class="pf-btn" href="#/events/${id}">← Torna all'evento</a></div>
    </main>`
}

/** Wires the category / (gironi|finali) tabs: redraws the tab bars + calendar body on each change. */
export function wirePublicCalendar(root: ParentNode, matches: ScheduledMatchView[], initialCat?: string): void {
  const calbody = root.querySelector('#calbody'); if (!calbody) return
  const catbar = root.querySelector('#cal-cattabs')!
  const girbar = root.querySelector('#cal-girtabs')!
  const keys = categoryKeys(matches)
  let selCat = (initialCat && keys.includes(initialCat) ? initialCat : keys[0]) ?? ''
  let selGir = 'ALL'
  function draw() {
    catbar.innerHTML = renderTabs(keys.map((c) => ({ key: c, label: c })), selCat)
    catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; draw() }))
    girbar.innerHTML = renderTabs(gironeTabs(matches, selCat), selGir)
    girbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selGir = b.dataset.key!; draw() }))
    calbody!.innerHTML = renderCalendar(filterMatches(matches, selCat, selGir), catName, false, { hideScheduledBadge: true })
  }
  draw()
}
