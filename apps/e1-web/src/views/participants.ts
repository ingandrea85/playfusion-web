import { renderOrganizerWorkspace, esc } from '@playfusion/app-shell'
import type { EventDetail, RegistrationView, FeeStatus } from '@playfusion/rest-client'
import { inlineError, type Screen } from '../view.js'
import { workspaceTabs } from './workspace.js'
import { toast } from '../toast.js'

export interface ParticipantsData { event: EventDetail; confirmed: RegistrationView[]; fees: Record<string, FeeStatus> }

export function renderParticipants(d: ParticipantsData): string {
  const rows = d.confirmed.length
    ? d.confirmed.map((r) => {
        const paid = d.fees[r.registrationId] === 'Paid'
        const badge = paid ? `<span class="pf-badge" style="color:var(--color-feedback-success)">Pagata</span>`
                           : `<span class="pf-badge pf-muted">Richiesta</span>`
        const pay = paid ? '' : `<button class="pf-btn pf-btn--primary" data-pay="${esc(r.registrationId)}">Segna quota pagata</button>`
        return `<li class="pf-card"><div class="pf-row">
          <span><b>${esc(r.teamName ?? r.participantRef)}</b> · <span class="pf-mono">${esc(r.categoria)}</span></span>
          <span>${badge} ${pay}</span></div></li>`
      }).join('')
    : `<li class="pf-card pf-muted">Nessun partecipante confermato.</li>`
  return `${renderOrganizerWorkspace({ name: `${esc(d.event.sport)} · ${esc(d.event.categorie.join(', '))}`, meta: `${esc(d.event.dates.from)}→${esc(d.event.dates.to)}` }, workspaceTabs(d.event), 'participants')}
    <main id="pf-main" class="pf-container">
      <div id="err"></div>
      <div class="pf-pagehead"><h1>Partecipanti confermati</h1></div>
      <ul id="participants-list" class="pf-stack" style="list-style:none;padding:0">${rows}</ul>
    </main>`
}

export const participantsScreen: Screen<ParticipantsData> = {
  load: async (ctx, p) => {
    const [event, confirmed, feeList] = await Promise.all([
      ctx.client.o3.getEvent(p.id),
      ctx.client.o5.listRegistrations(p.id, 'Confirmed'),
      ctx.client.o12.listFees(p.id),
    ])
    const fees = Object.fromEntries(feeList.map((f) => [f.registrationId, f.status]))
    return { event, confirmed, fees }
  },
  render: renderParticipants,
  mount(root, ctx, d) {
    root.querySelector('#participants-list')?.addEventListener('click', async (e) => {
      const rId = (e.target as HTMLElement).closest('[data-pay]')?.getAttribute('data-pay')
      if (!rId) return
      // E1-14: marking a fee paid is irreversible from the UI — confirm, naming the participant.
      const label = d.confirmed.find((r) => r.registrationId === rId)
      const who = label?.teamName ?? label?.participantRef ?? 'questo partecipante'
      if (!confirm(`Segnare la quota di "${who}" come pagata? L'operazione non è reversibile da qui.`)) return
      try { await ctx.client.o12.payFee(rId); toast('Quota segnata come pagata', 'success'); ctx.refresh() }
      catch { root.querySelector('#err')!.innerHTML = inlineError('Aggiornamento quota non riuscito.') }
    })
  },
}
