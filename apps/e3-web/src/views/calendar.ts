import type { EventDetail, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderCalendar, renderTabs, categoryKeys, esc, calendarGironeTabs, filterCalendarMatches, finalsPhaseTabs, FINALS_TAB } from '@playfusion/app-shell'

const catName = (c: string): string => c
const gironeTabs = (matches: ScheduledMatchView[], selCat: string) => calendarGironeTabs(matches, selCat)
const filterMatches = (matches: ScheduledMatchView[], selCat: string, selGir: string, selPhase: string) => filterCalendarMatches(matches, selCat, selGir, selPhase)

/** Public, read-only calendar (S7) with Category + (Gironi | Finali) filter tabs. When "Finali" is
 *  active a dynamic phase sub-filter (Quarti/Semifinali/Finale/Piazzamenti) appears (S13). Gated on
 *  PUBLISHED; scores shown when played (finals included). Call wirePublicCalendar after. */
export function renderPublicCalendar(event: EventDetail, schedule: ScheduleView, matches: ScheduledMatchView[], initialCat?: string): string {
  const id = encodeURIComponent(event.sportEventId)
  const published = schedule.status === 'PUBLISHED'
  const keys = categoryKeys(matches)
  const selCat = (initialCat && keys.includes(initialCat) ? initialCat : keys[0]) ?? ''
  const inner = published
    ? `<div id="cal-cattabs">${renderTabs(keys.map((c) => ({ key: c, label: c })), selCat)}</div>
       <div id="cal-girtabs">${renderTabs(gironeTabs(matches, selCat), 'ALL')}</div>
       <div id="cal-phasetabs"></div>
       <div id="calbody">${renderCalendar(filterMatches(matches, selCat, 'ALL', 'ALL'), catName)}</div>`
    : `<p class="pf-muted">Il calendario non è ancora stato pubblicato.</p>`
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">${esc(event.name ?? event.sport)}</div><h1>Calendario</h1></div>
      <div class="pf-card">${inner}</div>
      <div class="pf-row"><a class="pf-btn" href="#/events/${id}">← Torna all'evento</a></div>
    </main>`
}

/** Wires the category / (gironi|finali) / phase tabs: redraws the tab bars + calendar body on change.
 *  The phase sub-filter shows only while "Finali" is selected and there are ≥2 finals phases. */
export function wirePublicCalendar(root: ParentNode, matches: ScheduledMatchView[], initialCat?: string): void {
  const calbody = root.querySelector('#calbody'); if (!calbody) return
  const catbar = root.querySelector('#cal-cattabs')!
  const girbar = root.querySelector('#cal-girtabs')!
  const phasebar = root.querySelector('#cal-phasetabs')!
  const keys = categoryKeys(matches)
  let selCat = (initialCat && keys.includes(initialCat) ? initialCat : keys[0]) ?? ''
  let selGir = 'ALL'
  let selPhase = 'ALL'
  function draw() {
    catbar.innerHTML = renderTabs(keys.map((c) => ({ key: c, label: c })), selCat)
    catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; selPhase = 'ALL'; draw() }))
    girbar.innerHTML = renderTabs(gironeTabs(matches, selCat), selGir)
    girbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selGir = b.dataset.key!; selPhase = 'ALL'; draw() }))
    const phaseTabs = selGir === FINALS_TAB ? finalsPhaseTabs(matches, selCat) : []
    phasebar.innerHTML = phaseTabs.length ? `<div class="pf-tabs--sub">${renderTabs(phaseTabs, selPhase)}</div>` : ''
    phasebar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selPhase = b.dataset.key!; draw() }))
    calbody!.innerHTML = renderCalendar(filterMatches(matches, selCat, selGir, selPhase), catName, false, { hideScheduledBadge: true })
  }
  draw()
}
