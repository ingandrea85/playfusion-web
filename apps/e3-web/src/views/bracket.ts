import type { EventDetail, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderBracket, renderTabs, categoryKeys, esc } from '@playfusion/app-shell'

const catName = (c: string): string => c
const finalsOnly = (matches: ScheduledMatchView[]): ScheduledMatchView[] => matches.filter((m) => m.phase === 'FINAL' || m.phase === 'FINAL_GROUP')

/** Public, read-only finals bracket (S12) with Category tabs. Gated on PUBLISHED; `Nª Girone X`
 *  placeholders show the ranked team once the group is decided (resolved by the backend on read).
 *  Call wirePublicBracket after mounting. */
export function renderPublicBracket(event: EventDetail, schedule: ScheduleView, matches: ScheduledMatchView[]): string {
  const id = encodeURIComponent(event.sportEventId)
  const published = schedule.status === 'PUBLISHED'
  const finals = finalsOnly(matches)
  const selCat = categoryKeys(finals)[0] ?? ''
  const inner = !published
    ? `<p class="pf-muted">Il tabellone non è ancora stato pubblicato.</p>`
    : finals.length
      ? `<div id="brk-cattabs">${renderTabs(categoryKeys(finals).map((c) => ({ key: c, label: c })), selCat)}</div>
         <div id="brkbody">${renderBracket(finals.filter((f) => f.categoryId === selCat), catName)}</div>`
      : `<p class="pf-muted">Nessuna fase finale per questo evento.</p>`
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">${esc(event.name ?? event.sport)}</div><h1>Tabellone</h1></div>
      <div class="pf-card">${inner}</div>
      <div class="pf-row"><a class="pf-btn" href="#/events/${id}">← Torna all'evento</a></div>
    </main>`
}

export function wirePublicBracket(root: ParentNode, matches: ScheduledMatchView[]): void {
  const body = root.querySelector('#brkbody'); if (!body) return
  const catbar = root.querySelector('#brk-cattabs')!
  const finals = finalsOnly(matches)
  let selCat = categoryKeys(finals)[0] ?? ''
  function draw() {
    catbar.innerHTML = renderTabs(categoryKeys(finals).map((c) => ({ key: c, label: c })), selCat)
    catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selCat = b.dataset.key!; draw() }))
    body!.innerHTML = renderBracket(finals.filter((f) => f.categoryId === selCat), catName)
  }
  draw()
}
