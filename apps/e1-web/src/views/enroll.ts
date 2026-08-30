import { renderOrganizerWorkspace, esc, copyToClipboard, type WorkspaceTab } from '@playfusion/app-shell'
import type { EventDetail, RegistrationView, RegistrationWindowView } from '@playfusion/rest-client'
import { eventLabels } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'

export interface EnrollData { event: EventDetail; window: RegistrationWindowView; pending: RegistrationView[]; confirmed: RegistrationView[]; e3BaseUrl: string; enrollToken?: string }

const teamLabel = (r: RegistrationView): string => r.teamName ?? r.participantRef

/** The shareable coach enrollment link. Points straight to the SEPARATE registration page
 *  (`/apply`), not the public landing (option A). When the window has minted a token (at open)
 *  it is embedded as `?token=` before the hash so E3's captureMagicLink reads it and the coach
 *  sees the form. Falls back to the plain /apply link if no token yet. */
export function enrollUrl(e3BaseUrl: string, id: string, token?: string): string {
  const base = `${e3BaseUrl}/e3/`
  const hash = `#/events/${encodeURIComponent(id)}/apply`
  return token ? `${base}?token=${encodeURIComponent(token)}${hash}` : `${base}${hash}`
}

const tabs = (id: string): WorkspaceTab[] => [
  { key: 'overview', label: 'Panoramica', href: `#/events/${encodeURIComponent(id)}` },
  { key: 'enroll', label: 'Iscrizioni', href: `#/events/${encodeURIComponent(id)}/enroll` },
  { key: 'participants', label: 'Partecipanti', href: `#/events/${encodeURIComponent(id)}/participants` },
]

/** S14 — PB-2 direct roster: the organizer types teams straight in (no invite window / inbox). */
function renderRoster(d: EnrollData): string {
  const id = d.event.sportEventId
  const lb = eventLabels(d.event)
  const indiv = d.event.participantType === 'individual'
  const opts = d.event.categorie.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')
  const byCat = (c: string) => d.confirmed.filter((r) => r.categoria === c)
  const lists = d.event.categorie.map((c) => {
    const teams = byCat(c)
    const items = teams.length
      ? teams.map((r) => `<li class="pf-row" style="justify-content:space-between">
          <span><b>${esc(teamLabel(r))}</b></span>
          <button class="pf-btn pf-btn--ghost" data-remove="${esc(r.registrationId)}">Rimuovi</button></li>`).join('')
      : `<li class="pf-muted">Nessun${indiv ? ' giocatore' : 'a squadra'}.</li>`
    return `<div class="pf-card"><h3 class="pf-h4">${esc(c)} · <span class="pf-mono">${teams.length}</span></h3>
      <ul class="pf-stack" style="list-style:none;padding:0">${items}</ul></div>`
  }).join('')
  return `${renderOrganizerWorkspace({ name: `${esc(d.event.name ?? d.event.sport)}`, meta: `${esc(d.event.dates.from)}→${esc(d.event.dates.to)}` }, tabs(id), 'enroll')}
    <main class="pf-container">
      <div id="err"></div>
      <div class="pf-card"><h2>${esc(lb.participantPlural)} (inserimento diretto)</h2>
        <p class="pf-muted">PB-2: aggiungi qui ${indiv ? 'i giocatori' : 'le squadre'}. Il nome inserito è quello che comparirà nel calendario, nelle classifiche e nel tabellone.</p>
        <div class="pf-row">
          <select id="rteam-cat">${opts}</select>
          <input id="rteam-name" placeholder="Nome ${indiv ? 'giocatore' : 'squadra'}" style="flex:1" />
          <button class="pf-btn pf-btn--primary" data-addteam>Aggiungi</button>
        </div></div>
      ${lists}
    </main>`
}

export function renderEnroll(d: EnrollData): string {
  if (d.event.playbook === 'PB-2') return renderRoster(d)
  const id = d.event.sportEventId
  const open = d.window.state === 'Open'
  const capFor = (c: string) => d.window.categories.find((x) => x.categoria === c)
  const capRows = d.event.categorie.map((c) => {
    const w = capFor(c)
    return `<div class="pf-field"><label>${esc(c)}${w ? ` · ${w.count}/${w.cap} (${w.remaining} liberi)` : ''}</label>
      <input type="number" min="0" data-cap="${esc(c)}" value="${w ? w.cap : ''}" placeholder="posti" /></div>`
  }).join('')
  const shareUrl = enrollUrl(d.e3BaseUrl, id, d.enrollToken)
  const shareCard = open ? `<div class="pf-card"><h2>Link iscrizioni</h2>
      <p class="pf-muted">Invia questo link agli allenatori: aprendolo potranno iscrivere la propria squadra.</p>
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
    const [event, win, pending, confirmed, enroll] = await Promise.all([
      ctx.client.o3.getEvent(p.id),
      ctx.client.o5.getRegistrationWindow(p.id),
      ctx.client.o5.listRegistrations(p.id, 'Applied'),
      ctx.client.o5.listRegistrations(p.id, 'Confirmed'),
      ctx.client.o5.getEnrollToken(p.id).catch(() => ({ enrollToken: undefined })),
    ])
    return { event, window: win, pending, confirmed, e3BaseUrl: ctx.e3BaseUrl, enrollToken: enroll.enrollToken }
  },
  render: renderEnroll,
  mount(root, ctx, d) {
    const id = d.event.sportEventId
    const err = root.querySelector('#err')!
    const fail = (m: string) => { err.innerHTML = inlineError(m) }
    if (d.event.playbook === 'PB-2') { mountRoster(root, ctx, d, fail); return }
    root.querySelector('[data-open]')?.addEventListener('click', async () => {
      const caps: Record<string, number> = {}
      root.querySelectorAll<HTMLInputElement>('[data-cap]').forEach((i) => {
        const v = Number(i.value)
        if (i.value !== '' && v >= 0) caps[i.getAttribute('data-cap')!] = v
      })
      try { await ctx.client.o5.openRegistrationWindow(id, caps); ctx.refresh() } catch { fail('Apertura non riuscita.') }
    })
    root.querySelector('[data-copy]')?.addEventListener('click', async () => {
      const ok = await copyToClipboard(enrollUrl(d.e3BaseUrl, id, d.enrollToken))
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

/** Wires the PB-2 roster editor: add a team by name, remove a team; refresh on success. */
function mountRoster(root: ParentNode, ctx: ViewCtx, d: EnrollData, fail: (m: string) => void): void {
  const id = d.event.sportEventId
  root.querySelector('[data-addteam]')?.addEventListener('click', async () => {
    const cat = root.querySelector<HTMLSelectElement>('#rteam-cat')?.value ?? ''
    const name = (root.querySelector<HTMLInputElement>('#rteam-name')?.value ?? '').trim()
    if (!cat || !name) { fail('Indica categoria e nome squadra.'); return }
    try { await ctx.client.o5.addTeam(id, { categoria: cat, teamName: name }); ctx.refresh() }
    catch (e) { fail((e as { code?: string }).code === 'DUPLICATE_TEAM' ? 'Squadra già presente in questa categoria.' : 'Aggiunta non riuscita.') }
  })
  root.addEventListener('click', async (e) => {
    const rId = (e.target as HTMLElement).closest('[data-remove]')?.getAttribute('data-remove')
    if (!rId) return
    try { await ctx.client.o5.removeTeam(rId); ctx.refresh() } catch { fail('Rimozione non riuscita.') }
  })
}
