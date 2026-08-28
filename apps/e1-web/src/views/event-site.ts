import { esc } from '@playfusion/app-shell'
import type { EventDetail, EventSite, OrgSiteDefaults, ResolvedEventSite } from '@playfusion/rest-client'
import { resolveEventSite } from '@playfusion/rest-client'
import { inlineError, lockCard, type Screen, type ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'
import { sponsorRow, collectSponsors } from './org-site.js'

export interface EventSiteData { event: EventDetail; org: OrgSiteDefaults | null; locked?: boolean }

/** An override-toggle group: switch controls whether the field is inherited or event-specific. */
function overrideGroup(field: string, label: string, on: boolean, inheritedHint: string, body: string): string {
  return `<div class="pf-ovrgroup" data-field="${field}">
    <div class="pf-row" style="justify-content:space-between;align-items:center;gap:var(--space-sm)">
      <label style="font-weight:700;color:var(--color-text-soft);font-size:13px">${esc(label)}</label>
      <label class="pf-ovrswitch"><input type="checkbox" class="js-ovr" ${on ? 'checked' : ''}/> Personalizza</label>
    </div>
    <div class="js-ovr-body"${on ? '' : ' hidden'}>${body}</div>
    <p class="pf-muted js-ovr-inherit" style="margin:4px 0 0;font-size:13px"${on ? ' hidden' : ''}>Ereditato: ${inheritedHint}</p>
  </div>`
}

const dash = '<span class="pf-muted">— (non impostato dall\'organizzazione)</span>'

function previewHtml(r: ResolvedEventSite, event: EventDetail): string {
  if (!r.enabled) return `<p class="pf-muted">Il sito vetrina è nascosto: al pubblico resta la home essenziale (calendario, classifiche, tabellone).</p>`
  const sec = (title: string, body: string) => body ? `<div style="margin-bottom:var(--space-md)"><div class="pf-eyebrow">${esc(title)}</div>${body}</div>` : ''
  const sponsors = r.sponsors.length ? r.sponsors.map((s) => `<span class="pf-badge">${esc(s.name)}</span>`).join(' ') : ''
  const venue = r.venue && (r.venue.name || r.venue.address) ? `${esc(r.venue.name ?? '')}${r.venue.address ? ` · ${esc(r.venue.address)}` : ''}` : ''
  return `<div class="pf-siteprev">
    <div class="pf-siteprev__hero"><div class="pf-eyebrow">Evento</div><h3 style="margin:2px 0">${esc(event.name ?? event.sport)}</h3>${r.tagline ? `<div>${esc(r.tagline)}</div>` : ''}</div>
    ${sec('Chi siamo', r.about ? `<p style="margin:2px 0">${esc(r.about)}</p>` : '')}
    ${sec('Programma', r.program ? `<p style="margin:2px 0;white-space:pre-line">${esc(r.program)}</p>` : '')}
    ${sec('Dove', venue)}
    ${sec('Sponsor', sponsors)}
  </div>`
}

function form(data: EventSiteData): string {
  const s = data.event.site ?? {}
  const org = data.org ?? {}
  const ve = s.venue ?? {}, co = s.contacts ?? {}
  const eventSponsors = (s.sponsors ?? []).map(sponsorRow).join('')
  const orgSponsorsHint = (org.sponsors ?? []).map((x) => x.name).join(', ') || '—'
  return `<div id="err"></div>
    <div class="pf-card">
      <label class="pf-ovrswitch"><input type="checkbox" id="s-enabled" ${s.enabled === false ? '' : 'checked'}/> <b>Mostra il sito vetrina</b> al pubblico</label>
      <p class="pf-muted" style="margin:4px 0 0">Se disattivato, l'evento mostra solo la home essenziale (calendario, classifiche, tabellone).</p>
    </div>
    <div class="pf-sitegrid">
      <div class="pf-stack">
        <div class="pf-card">
          <div class="pf-field"><label>Tagline dell'evento</label><input id="s-tagline" value="${esc(s.tagline ?? '')}" placeholder="Es. Tre giorni di calcio giovanile" /></div>
          <div class="pf-field"><label>Programma</label><textarea id="s-program" rows="4" placeholder="Ven 15:00 Accoglienza · 16:30 Gironi…">${esc(s.program ?? '')}</textarea></div>
        </div>
        <div class="pf-card">
          ${overrideGroup('about', 'Chi siamo', s.about !== undefined, esc(org.about ?? '') || dash,
            `<textarea id="s-about" rows="4">${esc(s.about ?? '')}</textarea>`)}
        </div>
        <div class="pf-card">
          ${overrideGroup('venue', 'Dove si gioca', s.venue !== undefined,
            org.venue ? esc([org.venue.name, org.venue.address].filter(Boolean).join(' · ')) : dash,
            `<div class="pf-field"><label>Nome</label><input id="s-venue-name" value="${esc(ve.name ?? '')}" /></div>
             <div class="pf-field"><label>Indirizzo</label><input id="s-venue-address" value="${esc(ve.address ?? '')}" /></div>
             <div class="pf-field" style="margin:0"><label>Link mappa</label><input id="s-venue-map" value="${esc(ve.mapUrl ?? '')}" placeholder="https://maps…" /></div>`)}
        </div>
        <div class="pf-card">
          ${overrideGroup('contacts', 'Contatti', s.contacts !== undefined,
            org.contacts ? esc([org.contacts.email, org.contacts.phone, org.contacts.social].filter(Boolean).join(' · ')) : dash,
            `<div class="pf-field"><label>Email</label><input id="s-c-email" value="${esc(co.email ?? '')}" /></div>
             <div class="pf-field"><label>Telefono</label><input id="s-c-phone" value="${esc(co.phone ?? '')}" /></div>
             <div class="pf-field" style="margin:0"><label>Social</label><input id="s-c-social" value="${esc(co.social ?? '')}" /></div>`)}
        </div>
        <div class="pf-card">
          <h3 class="pf-h4" style="margin:0 0 var(--space-sm)">Sponsor</h3>
          <label class="pf-ovrswitch"><input type="checkbox" id="s-inherit-sp" ${s.inheritOrgSponsors === false ? '' : 'checked'}/> Eredita gli sponsor dell'organizzazione (${esc(orgSponsorsHint)})</label>
          <div class="pf-eyebrow" style="margin:var(--space-md) 0 var(--space-xs)">Sponsor specifici dell'evento</div>
          <div id="s-sponsors" class="pf-stack">${eventSponsors}</div>
          <button type="button" class="pf-btn pf-btn--ghost" id="s-sp-add" style="margin-top:var(--space-sm)">＋ Aggiungi sponsor</button>
        </div>
        <div class="pf-row" style="justify-content:flex-start"><button class="pf-btn pf-btn--primary" id="s-save">Salva</button></div>
      </div>
      <aside class="pf-card pf-sitepreview-card">
        <div class="pf-eyebrow">Anteprima pubblica</div>
        <div id="s-preview">${previewHtml(resolveEventSite(data.org, data.event.site), data.event)}</div>
      </aside>
    </div>`
}

export function renderEventSite(data: EventSiteData): string {
  if (data.locked) return workspaceShell(data.event, 'site', lockCard('Sito evento'))
  return workspaceShell(data.event, 'site', form(data))
}

/** Read the current EventSite from the form (undefined for inherited fields). */
export function collectEventSite(root: ParentNode): EventSite {
  const val = (sel: string) => (root.querySelector<HTMLInputElement>(sel)?.value ?? '').trim()
  const on = (field: string) => !!root.querySelector<HTMLInputElement>(`.pf-ovrgroup[data-field="${field}"] .js-ovr`)?.checked
  const site: EventSite = {
    tagline: val('#s-tagline') || undefined,
    program: val('#s-program') || undefined,
    sponsors: collectSponsors(root.querySelector('#s-sponsors')!),
  }
  if (root.querySelector<HTMLInputElement>('#s-enabled')?.checked === false) site.enabled = false
  if (root.querySelector<HTMLInputElement>('#s-inherit-sp')?.checked === false) site.inheritOrgSponsors = false
  if (on('about')) site.about = val('#s-about') || undefined
  if (on('venue')) site.venue = { name: val('#s-venue-name') || undefined, address: val('#s-venue-address') || undefined, mapUrl: val('#s-venue-map') || undefined }
  if (on('contacts')) site.contacts = { email: val('#s-c-email') || undefined, phone: val('#s-c-phone') || undefined, social: val('#s-c-social') || undefined }
  return site
}

export const eventSiteScreen: Screen<EventSiteData> = {
  load: async (ctx, p) => {
    // Per-event site is editable by any org member (organizer or owner) — whoever operates the event.
    // Org-level defaults stay owner-only (org console). Pro-gated.
    const event = await ctx.client.o3.getEvent(p.id)
    if (!ctx.entitlements.hasEventSite) return { event, org: null, locked: true }
    const org = await ctx.client.o1.getSite(ctx.orgId).catch(() => null)
    return { event, org }
  },
  render: (data) => renderEventSite(data),
  mount(root, ctx: ViewCtx, data) {
    if (data.locked) return
    const err = root.querySelector('#err')!
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!

    const redraw = () => { q('#s-preview').innerHTML = previewHtml(resolveEventSite(data.org, collectEventSite(root)), data.event) }

    // Override switches: show/hide the field body + inherit hint, then refresh the preview.
    root.querySelectorAll<HTMLInputElement>('.pf-ovrgroup .js-ovr').forEach((sw) => sw.addEventListener('change', () => {
      const group = sw.closest('.pf-ovrgroup')!
      group.querySelector<HTMLElement>('.js-ovr-body')!.hidden = !sw.checked
      group.querySelector<HTMLElement>('.js-ovr-inherit')!.hidden = sw.checked
      redraw()
    }))
    root.addEventListener('input', redraw)
    const sponsors = q('#s-sponsors')
    q<HTMLButtonElement>('#s-sp-add').addEventListener('click', () => { sponsors.insertAdjacentHTML('beforeend', sponsorRow()); redraw() })
    sponsors.addEventListener('click', (e) => {
      const del = (e.target as HTMLElement).closest('.js-sp-del')
      if (del) { del.closest('.pf-sprow')?.remove(); redraw() }
    })

    q<HTMLButtonElement>('#s-save').addEventListener('click', async () => {
      const btn = q<HTMLButtonElement>('#s-save'); btn.disabled = true
      try { await ctx.client.o3.setEventSite(data.event.sportEventId, collectEventSite(root)); ctx.refresh() }
      catch { err.innerHTML = inlineError('Salvataggio non riuscito. Riprova.'); btn.disabled = false }
    })
  },
}
