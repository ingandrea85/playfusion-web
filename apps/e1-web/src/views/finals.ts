import { renderBracket, renderTabs, categoryKeys } from '@playfusion/app-shell'
import type { EventDetail, ScheduledMatchView } from '@playfusion/rest-client'
import type { Screen, ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface FinalsData { event: EventDetail; finals: ScheduledMatchView[] }

const catName = (c: string): string => c

/** S12: organizer Finali tab — the bracket per selected category. Finals ride the matches list
 *  (phase FINAL) with `homeResolved`/`awayResolved` filled by the backend as groups complete. */
function finalsCard(finals: ScheduledMatchView[], selCat: string): string {
  const cats = categoryKeys(finals)
  const tabs = cats.map((c) => ({ key: c, label: c }))
  const body = finals.length
    ? `<div id="ft-cattabs">${renderTabs(tabs, selCat)}</div>
       <div id="fnbody">${renderBracket(finals.filter((f) => f.categoryId === selCat), catName)}</div>`
    : `<p class="pf-muted">Nessun tabellone: configura la <b>Fase finale</b> (tab Competizione) e genera il calendario.</p>`
  return `<div class="pf-card"><h2 class="pf-h3">Finali</h2>${body}</div>`
}

export function renderFinalsView(data: FinalsData): string {
  return workspaceShell(data.event, 'finals', finalsCard(data.finals, categoryKeys(data.finals)[0] ?? ''))
}

export const finalsScreen: Screen<FinalsData> = {
  load: async (ctx, p) => {
    const [event, matches] = await Promise.all([ctx.client.o3.getEvent(p.id), ctx.client.o7.getMatches(p.id)])
    return { event, finals: matches.filter((m) => m.phase === 'FINAL' || m.phase === 'FINAL_GROUP') }
  },
  render: renderFinalsView,
  mount(root, _ctx: ViewCtx, data) {
    const body = root.querySelector('#fnbody'); if (!body) return
    const catbar = root.querySelector('#ft-cattabs')!
    let selCat = categoryKeys(data.finals)[0] ?? ''
    function draw() {
      catbar.innerHTML = renderTabs(categoryKeys(data.finals).map((c) => ({ key: c, label: c })), selCat)
      catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
        b.addEventListener('click', () => { selCat = b.dataset.key!; draw() }))
      body!.innerHTML = renderBracket(data.finals.filter((f) => f.categoryId === selCat), catName)
    }
    draw()
  },
}
