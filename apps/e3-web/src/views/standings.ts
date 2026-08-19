import type { EventDetail, GroupStanding } from '@playfusion/rest-client'
import { renderPublicTopbar, renderStandings, renderTabs, categoryKeys, groupKeys, esc } from '@playfusion/app-shell'

const catName = (c: string): string => c
const filterStandings = (standings: GroupStanding[], selCat: string, selGir: string): GroupStanding[] =>
  standings.filter((g) => g.categoryId === selCat && (selGir === 'ALL' || g.groupLabel === selGir))

/** Public, read-only standings (S10) with Category + Girone filter tabs (S23). Call
 *  wirePublicStandings after mounting. */
export function renderPublicStandings(event: EventDetail, standings: GroupStanding[]): string {
  const id = encodeURIComponent(event.sportEventId)
  const selCat = categoryKeys(standings)[0] ?? ''
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">${esc(event.name ?? event.sport)}</div><h1>Classifiche</h1></div>
      <div class="pf-card">
        <div id="st-cattabs">${renderTabs(categoryKeys(standings).map((c) => ({ key: c, label: c })), selCat)}</div>
        <div id="st-girtabs">${renderTabs([{ key: 'ALL', label: 'Tutti' }, ...groupKeys(standings, selCat).map((g) => ({ key: g, label: g }))], 'ALL')}</div>
        <div id="stbody">${renderStandings(filterStandings(standings, selCat, 'ALL'), catName)}</div>
      </div>
      <div class="pf-row"><a class="pf-btn" href="#/events/${id}">← Torna all'evento</a></div>
    </main>`
}

export function wirePublicStandings(root: ParentNode, standings: GroupStanding[]): void {
  const stbody = root.querySelector('#stbody'); if (!stbody) return
  const catbar = root.querySelector('#st-cattabs')!
  const girbar = root.querySelector('#st-girtabs')!
  let selCat = categoryKeys(standings)[0] ?? ''
  let selGir = 'ALL'
  function draw() {
    catbar.innerHTML = renderTabs(categoryKeys(standings).map((c) => ({ key: c, label: c })), selCat)
    catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; draw() }))
    girbar.innerHTML = renderTabs([{ key: 'ALL', label: 'Tutti' }, ...groupKeys(standings, selCat).map((g) => ({ key: g, label: g }))], selGir)
    girbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selGir = b.dataset.key!; draw() }))
    stbody!.innerHTML = renderStandings(filterStandings(standings, selCat, selGir), catName)
  }
  draw()
}
