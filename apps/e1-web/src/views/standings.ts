import { renderStandings, renderTabs, categoryKeys, groupKeys } from '@playfusion/app-shell'
import type { EventDetail, GroupStanding } from '@playfusion/rest-client'
import type { Screen, ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface StandingsData { event: EventDetail; standings: GroupStanding[] }

const catName = (c: string): string => c

const filterStandings = (standings: GroupStanding[], selCat: string, selGir: string): GroupStanding[] =>
  standings.filter((g) => g.categoryId === selCat && (selGir === 'ALL' || g.groupLabel === selGir))

/** Classifiche card with Category + Girone filter tabs (S23). */
function standingsCard(standings: GroupStanding[], selCat: string, selGir: string): string {
  const gtabs = [{ key: 'ALL', label: 'Tutti' }, ...groupKeys(standings, selCat).map((g) => ({ key: g, label: g }))]
  return `<div class="pf-card"><h2 class="pf-h3">Classifiche</h2>
    <div id="st-cattabs">${renderTabs(categoryKeys(standings).map((c) => ({ key: c, label: c })), selCat)}</div>
    <div id="st-girtabs">${renderTabs(gtabs, selGir)}</div>
    <div id="stbody">${renderStandings(filterStandings(standings, selCat, selGir), catName)}</div>
  </div>`
}

export function renderStandingsView(data: StandingsData): string {
  return workspaceShell(data.event, 'standings', standingsCard(data.standings, categoryKeys(data.standings)[0] ?? '', 'ALL'))
}

export const standingsScreen: Screen<StandingsData> = {
  load: async (ctx, p) => {
    const [event, standings] = await Promise.all([ctx.client.o3.getEvent(p.id), ctx.client.o7.getStandings(p.id)])
    return { event, standings }
  },
  render: renderStandingsView,
  mount(root, _ctx: ViewCtx, data) {
    const stbody = root.querySelector('#stbody'); if (!stbody) return
    const catbar = root.querySelector('#st-cattabs')!
    const girbar = root.querySelector('#st-girtabs')!
    let selCat = categoryKeys(data.standings)[0] ?? ''
    let selGir = 'ALL'
    function draw() {
      catbar.innerHTML = renderTabs(categoryKeys(data.standings).map((c) => ({ key: c, label: c })), selCat)
      catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
        b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; draw() }))
      const gtabs = [{ key: 'ALL', label: 'Tutti' }, ...groupKeys(data.standings, selCat).map((g) => ({ key: g, label: g }))]
      girbar.innerHTML = renderTabs(gtabs, selGir)
      girbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
        b.addEventListener('click', () => { selGir = b.dataset.key!; draw() }))
      stbody!.innerHTML = renderStandings(filterStandings(data.standings, selCat, selGir), catName)
    }
    draw()
  },
}
