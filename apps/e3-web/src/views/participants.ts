import type { RegistrationView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderTabs, esc } from '@playfusion/app-shell'

const confirmedOnly = (rows: RegistrationView[]): RegistrationView[] => rows.filter((r) => r.status === 'Confirmed')
// Distinct categorie of the confirmed teams, first-seen order.
const categories = (rows: RegistrationView[]): string[] => {
  const out: string[] = []
  for (const r of confirmedOnly(rows)) if (!out.includes(r.categoria)) out.push(r.categoria)
  return out
}

const teamList = (rows: RegistrationView[], selCat: string): string => {
  const items = confirmedOnly(rows).filter((r) => r.categoria === selCat)
  return items.length
    ? `<ul class="pf-stack" style="list-style:none;padding:0">${items.map((r) => `<li class="pf-card"><b>${esc(r.participantRef)}</b></li>`).join('')}</ul>`
    : `<p class="pf-muted">Nessuna squadra confermata in questa categoria.</p>`
}

/** Public confirmed teams, filtered by a Category tab (only confirmed are visible — the API filters,
 *  and we guard client-side). Call wireParticipants after mounting. */
export function renderParticipants(rows: RegistrationView[]): string {
  const cats = categories(rows)
  const selCat = cats[0] ?? ''
  const body = cats.length
    ? `<div id="pt-cattabs">${renderTabs(cats.map((c) => ({ key: c, label: c })), selCat)}</div>
       <div id="ptbody">${teamList(rows, selCat)}</div>`
    : `<p class="pf-muted">Nessuna squadra confermata.</p>`
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><h1>Squadre iscritte</h1></div>
      <div class="pf-card">${body}</div>
    </main>`
}

export function wireParticipants(root: ParentNode, rows: RegistrationView[]): void {
  const body = root.querySelector('#ptbody'); if (!body) return
  const catbar = root.querySelector('#pt-cattabs')!
  const cats = categories(rows)
  let selCat = cats[0] ?? ''
  function draw() {
    catbar.innerHTML = renderTabs(cats.map((c) => ({ key: c, label: c })), selCat)
    catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => { selCat = b.dataset.key!; draw() }))
    body!.innerHTML = teamList(rows, selCat)
  }
  draw()
}
