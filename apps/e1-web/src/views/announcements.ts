import { esc } from '@playfusion/app-shell'
import type { AnnouncementView, EventDetail, RegistrationView } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface AnnouncementsData { event: EventDetail; announcements: AnnouncementView[]; confirmed: RegistrationView[] }

const scopeLabel = (categoryId: string | null): string => categoryId ?? 'Tutte le categorie'

/** Confirmed teams that would see an announcement scoped to `categoryId` (null = whole event). */
export function reachOf(confirmed: RegistrationView[], categoryId: string | null): number {
  return confirmed.filter((r) => categoryId === null || r.categoria === categoryId).length
}

function renderList(list: AnnouncementView[]): string {
  if (!list.length) return `<div class="pf-card pf-muted">Nessun avviso pubblicato.</div>`
  return `<div class="pf-stack">${list.map((a) => `<div class="pf-card">
    <div class="pf-row" style="justify-content:space-between;align-items:flex-start;gap:var(--space-md)">
      <div>
        <div>${a.pinned ? '<span class="pf-annchip">In evidenza</span> ' : ''}<b>${esc(a.title)}</b> <span class="pf-mono pf-muted">· ${esc(scopeLabel(a.categoryId))}</span></div>
        <p class="pf-muted" style="margin:6px 0 0">${esc(a.body)}</p>
      </div>
      <span class="pf-row" style="gap:var(--space-xs);flex:0 0 auto">
        <button class="pf-btn pf-btn--ghost" data-pin="${esc(a.announcementId)}" data-pinned="${a.pinned}">${a.pinned ? 'Togli evidenza' : 'In evidenza'}</button>
        <button class="pf-btn pf-btn--ghost" data-del="${esc(a.announcementId)}">Elimina</button>
      </span>
    </div>
  </div>`).join('')}</div>`
}

export function renderAnnouncements(data: AnnouncementsData, activeTab = 'announcements'): string {
  const opts = `<option value="">Tutte le categorie</option>` + data.event.categorie.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')
  const body = `<div id="err"></div>
    <div class="pf-card">
      <h2 class="pf-h3">Nuovo avviso</h2>
      <div class="pf-field"><label>Titolo</label><input id="a-title" placeholder="Es. Cambio campo" /></div>
      <div class="pf-field"><label>Testo</label><textarea id="a-body" rows="3" placeholder="Dettagli dell'avviso"></textarea></div>
      <div class="pf-row" style="align-items:flex-end;gap:var(--space-md)">
        <div class="pf-field" style="margin-bottom:0;min-width:200px"><label>Destinatari</label><select id="a-cat">${opts}</select></div>
        <label class="pf-switch"><input type="checkbox" id="a-pin" /> In evidenza</label>
      </div>
      <p class="pf-muted" id="a-reach"></p>
      <button class="pf-btn pf-btn--primary" id="a-pub">Pubblica</button>
    </div>
    <div id="list">${renderList(data.announcements)}</div>`
  return workspaceShell(data.event, activeTab, body)
}

export const announcementsScreen: Screen<AnnouncementsData> = {
  load: async (ctx, p) => {
    const [event, announcements, confirmed] = await Promise.all([
      ctx.client.o3.getEvent(p.id),
      ctx.client.o9.listAnnouncements(p.id).catch(() => [] as AnnouncementView[]),
      ctx.client.o5.listRegistrations(p.id, 'Confirmed').catch(() => [] as RegistrationView[]),
    ])
    return { event, announcements, confirmed }
  },
  render: (data) => renderAnnouncements(data),
  mount(root, ctx: ViewCtx, data) {
    const id = data.event.sportEventId
    const err = root.querySelector('#err')!
    const fail = (msg: string) => { err.innerHTML = inlineError(msg) }
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!

    const catSel = q<HTMLSelectElement>('#a-cat')
    const selectedScope = (): string | null => (catSel.value === '' ? null : catSel.value)
    const updateReach = () => { q('#a-reach').textContent = `Sarà visibile a ${reachOf(data.confirmed, selectedScope())} squadre confermate.` }
    catSel.addEventListener('change', updateReach)
    updateReach()

    q<HTMLButtonElement>('#a-pub').addEventListener('click', async () => {
      const title = q<HTMLInputElement>('#a-title').value.trim()
      const bodyText = q<HTMLTextAreaElement>('#a-body').value.trim()
      if (!title || !bodyText) { fail('Inserisci titolo e testo.'); return }
      const btn = q<HTMLButtonElement>('#a-pub'); btn.disabled = true
      try {
        await ctx.client.o9.publishAnnouncement(id, { categoryId: selectedScope(), title, body: bodyText, pinned: q<HTMLInputElement>('#a-pin').checked })
        ctx.refresh()
      } catch { fail('Pubblicazione non riuscita. Riprova.'); btn.disabled = false }
    })

    root.querySelectorAll<HTMLButtonElement>('#list [data-pin]').forEach((b) => b.addEventListener('click', async () => {
      try { await ctx.client.o9.setPin(b.dataset.pin!, b.dataset.pinned !== 'true'); ctx.refresh() }
      catch { fail('Operazione non riuscita. Riprova.') }
    }))
    root.querySelectorAll<HTMLButtonElement>('#list [data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Eliminare l\'avviso?')) return
      try { await ctx.client.o9.deleteAnnouncement(b.dataset.del!); ctx.refresh() }
      catch { fail('Eliminazione non riuscita. Riprova.') }
    }))
  },
}
