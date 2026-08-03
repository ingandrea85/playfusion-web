import { renderOrganizerWorkspace, esc, copyToClipboard, type WorkspaceTab } from '@playfusion/app-shell'
import type { EventDetail, RegistrationView, RegistrationWindowView } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'

export interface EnrollData { event: EventDetail; window: RegistrationWindowView; pending: RegistrationView[]; e3BaseUrl: string }

const tabs = (id: string): WorkspaceTab[] => [
  { key: 'overview', label: 'Panoramica', href: `#/events/${encodeURIComponent(id)}` },
  { key: 'enroll', label: 'Iscrizioni', href: `#/events/${encodeURIComponent(id)}/enroll` },
  { key: 'participants', label: 'Partecipanti', href: `#/events/${encodeURIComponent(id)}/participants` },
]

export function renderEnroll(d: EnrollData): string {
  const id = d.event.sportEventId
  const open = d.window.state === 'Open'
  const capFor = (c: string) => d.window.categories.find((x) => x.categoria === c)
  const capRows = d.event.categorie.map((c) => {
    const w = capFor(c)
    return `<div class="pf-field"><label>${esc(c)}${w ? ` · ${w.count}/${w.cap} (${w.remaining} liberi)` : ''}</label>
      <input type="number" min="0" data-cap="${esc(c)}" value="${w ? w.cap : ''}" placeholder="posti" /></div>`
  }).join('')
  const shareUrl = `${d.e3BaseUrl}/e3/#/events/${encodeURIComponent(id)}`
  const shareCard = open ? `<div class="pf-card"><h2>Link iscrizioni</h2>
      <div class="pf-row"><input id="share" readonly value="${esc(shareUrl)}" style="flex:1" />
        <button class="pf-btn" data-copy>Copia</button><a class="pf-btn" href="${esc(shareUrl)}" target="_blank" rel="noopener">Apri</a></div>
      <span id="copied" class="pf-muted"></span></div>` : ''
  const inbox = d.pending.length
    ? d.pending.map((r) => `<li class="pf-card"><div class="pf-row">
        <span><b>${esc(r.participantRef)}</b> · <span class="pf-mono">${esc(r.categoria)}</span></span>
        <span><button class="pf-btn pf-btn--primary" data-confirm="${esc(r.registrationId)}">Conferma</button>
          <button class="pf-btn" data-reject="${esc(r.registrationId)}">Rifiuta</button></span></div></li>`).join('')
    : `<li class="pf-card pf-muted">Nessuna richiesta in attesa.</li>`
  return `${renderOrganizerWorkspace({ name: `${esc(d.event.sport)} · ${esc(d.event.categorie.join(', '))}`, meta: `${esc(d.event.dates.from)}→${esc(d.event.dates.to)}` }, tabs(id), 'enroll')}
    <main class="pf-container">
      <div id="err"></div>
      <div class="pf-card"><h2>Finestra iscrizioni · <span class="pf-mono">${open ? 'Aperta' : 'Chiusa'}</span></h2>
        ${capRows}
        <button class="pf-btn pf-btn--primary" data-open>${open ? 'Aggiorna posti' : 'Apri iscrizioni'}</button></div>
      ${shareCard}
      <div class="pf-pagehead" style="margin-top:var(--space-lg)"><h2>Richieste in attesa</h2></div>
      <ul id="inbox" class="pf-stack" style="list-style:none;padding:0">${inbox}</ul>
    </main>`
}

export const enrollScreen: Screen<EnrollData> = {
  load: async (ctx, p) => {
    const [event, win, pending] = await Promise.all([
      ctx.client.o3.getEvent(p.id),
      ctx.client.o5.getRegistrationWindow(p.id),
      ctx.client.o5.listRegistrations(p.id, 'Applied'),
    ])
    return { event, window: win, pending, e3BaseUrl: ctx.e3BaseUrl }
  },
  render: renderEnroll,
  mount(root, ctx, d) {
    const id = d.event.sportEventId
    const err = root.querySelector('#err')!
    const fail = (m: string) => { err.innerHTML = inlineError(m) }
    root.querySelector('[data-open]')?.addEventListener('click', async () => {
      const caps: Record<string, number> = {}
      root.querySelectorAll<HTMLInputElement>('[data-cap]').forEach((i) => {
        const v = Number(i.value)
        if (i.value !== '' && v >= 0) caps[i.getAttribute('data-cap')!] = v
      })
      try { await ctx.client.o5.openRegistrationWindow(id, caps); ctx.refresh() } catch { fail('Apertura non riuscita.') }
    })
    root.querySelector('[data-copy]')?.addEventListener('click', async () => {
      const ok = await copyToClipboard(`${d.e3BaseUrl}/e3/#/events/${encodeURIComponent(id)}`)
      const el = root.querySelector('#copied')
      if (el) el.textContent = ok ? 'Copiato ✓' : 'Copia manuale'
    })
    root.querySelector('#inbox')?.addEventListener('click', async (e) => {
      const t = e.target as HTMLElement
      const cId = t.closest('[data-confirm]')?.getAttribute('data-confirm')
      const rId = t.closest('[data-reject]')?.getAttribute('data-reject')
      try {
        if (cId) { await ctx.client.o5.confirmRegistration(cId); ctx.refresh() }
        else if (rId) { await ctx.client.o5.rejectRegistration(rId, 'rejected by organizer'); ctx.refresh() }
      } catch { fail('Operazione non riuscita.') }
    })
  },
}
